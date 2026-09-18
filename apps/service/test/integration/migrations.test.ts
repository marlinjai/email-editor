import { cp, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_MIGRATIONS_DIR, migrate, MigrationError } from '../../src/migrate.js';
import { freshDatabase } from '../support/db.js';

const quiet = { log: () => {} };
let cleanup: Array<() => Promise<void>> = [];
afterEach(async () => {
  await Promise.all(cleanup.map((f) => f()));
  cleanup = [];
});

async function db() {
  const d = await freshDatabase();
  cleanup.push(d.drop);
  return d;
}

async function copyOfMigrations(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'mail-migrations-'));
  await cp(DEFAULT_MIGRATIONS_DIR, dir, { recursive: true });
  return dir;
}

describe('migrations', () => {
  it('builds the schema from an empty database', async () => {
    const { sql } = await db();
    const result = await migrate(sql, quiet);
    expect(result.applied).toEqual(['0001_foundation.sql']);
    const tables = await sql<{ table_name: string }[]>`
      SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`;
    expect(tables.map((t) => t.table_name)).toEqual([
      '_migrations',
      'api_keys',
      'audit_log',
      'idempotency_keys',
      'workspace_members',
      'workspaces',
    ]);
  });

  it('is a no-op the second time (re-entry after completion)', async () => {
    const { sql } = await db();
    await migrate(sql, quiet);
    const again = await migrate(sql, quiet);
    expect(again.applied).toEqual([]);
    expect(again.alreadyApplied).toBe(1);
  });

  it('applies each file exactly once when two containers migrate at the same moment', async () => {
    const { sql, url } = await db();
    const { createSql } = await import('../../src/db.js');
    const second = createSql(url, { max: 2 });
    cleanup.unshift(() => second.end({ timeout: 5 }));
    const [a, b] = await Promise.all([migrate(sql, quiet), migrate(second, quiet)]);
    expect([...a.applied, ...b.applied]).toEqual(['0001_foundation.sql']);
    const rows = await sql`SELECT name FROM _migrations`;
    expect(rows).toHaveLength(1);
  });

  it('leaves nothing half-applied when a file fails, and resumes from it once fixed', async () => {
    const { sql } = await db();
    const dir = await copyOfMigrations();
    await writeFile(join(dir, '0002_broken.sql'), 'CREATE TABLE half_done (id int);\nSELECT * FROM no_such_table;\n');
    await expect(migrate(sql, { ...quiet, dir })).rejects.toThrow(/no_such_table/);
    const applied = await sql<{ name: string }[]>`SELECT name FROM _migrations ORDER BY name`;
    expect(applied.map((r) => r.name)).toEqual(['0001_foundation.sql']);
    const half = await sql`SELECT 1 FROM information_schema.tables WHERE table_name = 'half_done'`;
    expect(half).toHaveLength(0);

    await writeFile(join(dir, '0002_broken.sql'), 'CREATE TABLE half_done (id int);\n');
    const resumed = await migrate(sql, { ...quiet, dir });
    expect(resumed.applied).toEqual(['0002_broken.sql']);
  });

  it('refuses to run when an applied file was edited afterwards', async () => {
    const { sql } = await db();
    const dir = await copyOfMigrations();
    await migrate(sql, { ...quiet, dir });
    await writeFile(join(dir, '0001_foundation.sql'), '-- edited\n', { flag: 'a' });
    await expect(migrate(sql, { ...quiet, dir })).rejects.toBeInstanceOf(MigrationError);
  });

  it('tolerates a migration from a newer build (an image rollback) and reports it', async () => {
    const { sql } = await db();
    const dir = await copyOfMigrations();
    await writeFile(join(dir, '0002_newer.sql'), 'CREATE TABLE newer (id int);\n');
    await migrate(sql, { ...quiet, dir });
    const lines: string[] = [];
    const result = await migrate(sql, { log: (l) => lines.push(l) });
    expect(result.unknown).toEqual(['0002_newer.sql']);
    expect(lines.join('\n')).toContain('0002_newer.sql');
  });

  it('rejects badly named files', async () => {
    const { sql } = await db();
    const dir = await copyOfMigrations();
    await writeFile(join(dir, '2_oops.sql'), 'SELECT 1;');
    await expect(migrate(sql, { ...quiet, dir })).rejects.toThrow(/NNNN_lowercase_name/);
  });
});
