import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import type { Sql } from './db.js';

/**
 * The migrations runner. Ordered, additive SQL files in `migrations/`, named
 * `NNNN_name.sql`, recorded in `_migrations` with a checksum.
 *
 * - Run explicitly (`main.js migrate`, which the container entrypoint calls
 *   before starting the server), never at build time and never implicitly on
 *   server start.
 * - Each file applies in its own transaction together with its `_migrations`
 *   row, so a failing file leaves nothing half-applied and the next run resumes
 *   from it.
 * - Every transaction takes the same advisory lock first and re-checks what is
 *   applied, so two containers starting at once (a rolling deploy) apply each
 *   file exactly once.
 * - An applied file whose content has since changed stops the run: applied
 *   migrations are history, and a change belongs in a new file.
 */

export const DEFAULT_MIGRATIONS_DIR = fileURLToPath(new URL('../migrations/', import.meta.url));

/** Arbitrary, fixed: "lumitra mail migrations". */
const LOCK_KEY = 7_382_014_551;
const FILE_PATTERN = /^(\d{4})_[a-z0-9_]+\.sql$/;

export type Migration = { name: string; sql: string; checksum: string };

export class MigrationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MigrationError';
  }
}

export async function loadMigrations(dir: string = DEFAULT_MIGRATIONS_DIR): Promise<Migration[]> {
  const entries = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
  const seen = new Set<string>();
  const out: Migration[] = [];
  for (const name of entries) {
    const match = FILE_PATTERN.exec(name);
    if (!match) throw new MigrationError(`${name}: migration files are named NNNN_lowercase_name.sql`);
    if (seen.has(match[1]!)) throw new MigrationError(`${name}: two migrations share the number ${match[1]}`);
    seen.add(match[1]!);
    const sql = await readFile(`${dir}/${name}`, 'utf8');
    out.push({ name, sql, checksum: createHash('sha256').update(sql).digest('hex') });
  }
  return out;
}

export type MigrateResult = { applied: string[]; alreadyApplied: number; unknown: string[] };

export async function migrate(
  sql: Sql,
  options: { dir?: string; log?: (line: string) => void } = {},
): Promise<MigrateResult> {
  const log = options.log ?? ((line: string) => console.log(`[migrate] ${line}`));
  const migrations = await loadMigrations(options.dir);

  await sql.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(${LOCK_KEY})`;
    await tx`
      CREATE TABLE IF NOT EXISTS _migrations (
        name        text PRIMARY KEY,
        checksum    text NOT NULL,
        applied_at  timestamptz NOT NULL DEFAULT now()
      )`;
  });

  const recorded = await sql<{ name: string; checksum: string }[]>`SELECT name, checksum FROM _migrations`;
  const byName = new Map(recorded.map((r) => [r.name, r.checksum]));
  for (const m of migrations) {
    const checksum = byName.get(m.name);
    if (checksum !== undefined && checksum !== m.checksum) {
      throw new MigrationError(
        `${m.name} was changed after it was applied. Applied migrations are never edited; put the change in a new file.`,
      );
    }
  }
  // A migration the database has but this build does not is what an image
  // rollback looks like. Additive migrations keep the older code working, so it
  // is reported, not fatal.
  const known = new Set(migrations.map((m) => m.name));
  const unknown = recorded.map((r) => r.name).filter((n) => !known.has(n));
  for (const name of unknown) log(`note: ${name} is applied in the database but not part of this build`);

  const applied: string[] = [];
  for (const m of migrations) {
    const didApply = await sql.begin(async (tx) => {
      await tx`SELECT pg_advisory_xact_lock(${LOCK_KEY})`;
      const done = await tx`SELECT 1 FROM _migrations WHERE name = ${m.name}`;
      if (done.length > 0) return false;
      await tx.unsafe(m.sql);
      await tx`INSERT INTO _migrations (name, checksum) VALUES (${m.name}, ${m.checksum})`;
      return true;
    });
    if (didApply) {
      applied.push(m.name);
      log(`applied ${m.name}`);
    }
  }
  const alreadyApplied = migrations.length - applied.length;
  log(applied.length === 0 ? `up to date (${alreadyApplied} applied)` : `done: ${applied.length} new, ${alreadyApplied} before`);
  return { applied, alreadyApplied, unknown };
}
