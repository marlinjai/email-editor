import { cp, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_MIGRATIONS_DIR, loadMigrations, migrate, MigrationError } from '../../src/migrate.js';
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

// Every file this build ships, so the tests keep holding as migrations are added
// (0002, templates and assets, arrives from a parallel branch).
const shipped = async () => (await loadMigrations()).map((m) => m.name);

const S0_TABLES = ['_migrations', 'api_keys', 'audit_log', 'idempotency_keys', 'workspace_members', 'workspaces'];
const S2_TABLES = [
  'contact_topic_subscriptions',
  'contacts',
  'mailing_recipients',
  'mailings',
  'messages',
  'provider_sends',
  'providers',
  'suppressions',
  'topics',
  'webhook_deliveries',
  'webhook_endpoints',
  'webhook_events',
];

async function tableNames(sql: import('../../src/db.js').Sql): Promise<string[]> {
  const rows = await sql<{ table_name: string }[]>`
    SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`;
  return rows.map((t) => t.table_name);
}

describe('migrations', () => {
  it('builds the schema from an empty database', async () => {
    const { sql } = await db();
    const result = await migrate(sql, quiet);
    expect(result.applied).toEqual(await shipped());
    expect(result.applied).toEqual(expect.arrayContaining(['0001_foundation.sql', '0003_sending.sql']));
    expect(await tableNames(sql)).toEqual(expect.arrayContaining([...S0_TABLES, ...S2_TABLES]));
  });

  it('is a no-op the second time (re-entry after completion)', async () => {
    const { sql } = await db();
    await migrate(sql, quiet);
    const again = await migrate(sql, quiet);
    expect(again.applied).toEqual([]);
    expect(again.alreadyApplied).toBe((await shipped()).length);
  });

  it('applies 0002 after 0003 on a database that already has 0003 (parallel branches merged in either order)', async () => {
    // The runner applies every file not yet recorded, in name order, so a
    // lower-numbered file that arrives later is applied on the next run. 0003
    // does not depend on anything 0002 creates, which is what makes this safe.
    const { sql } = await db();
    const dir = await copyOfMigrations();
    const real0002 = (await readdir(dir)).find((f) => f.startsWith('0002_'));
    if (real0002) await rm(join(dir, real0002));
    const first = await migrate(sql, { ...quiet, dir });
    expect(first.applied).toEqual(expect.arrayContaining(['0001_foundation.sql', '0003_sending.sql']));
    expect(first.applied.some((n) => n.startsWith('0002_'))).toBe(false);

    const late = real0002 ?? '0002_arrives_late.sql';
    if (real0002) await cp(join(DEFAULT_MIGRATIONS_DIR, real0002), join(dir, real0002));
    else await writeFile(join(dir, late), 'CREATE TABLE arrives_late (id int);\n');
    const second = await migrate(sql, { ...quiet, dir });
    expect(second.applied).toEqual([late]);
    expect(await tableNames(sql)).toEqual(expect.arrayContaining(S2_TABLES));
    const recorded = await sql<{ name: string }[]>`SELECT name FROM _migrations ORDER BY name`;
    expect(recorded.map((r) => r.name)).toContain(late);
  });

  it('applies each file exactly once when two containers migrate at the same moment', async () => {
    const { sql, url } = await db();
    const { createSql } = await import('../../src/db.js');
    const second = createSql(url, { max: 2 });
    cleanup.unshift(() => second.end({ timeout: 5 }));
    const [a, b] = await Promise.all([migrate(sql, quiet), migrate(second, quiet)]);
    const names = await shipped();
    expect([...a.applied, ...b.applied].sort()).toEqual(names);
    const rows = await sql`SELECT name FROM _migrations`;
    expect(rows).toHaveLength(names.length);
  });

  it('leaves nothing half-applied when a file fails, and resumes from it once fixed', async () => {
    const { sql } = await db();
    const dir = await copyOfMigrations();
    await writeFile(join(dir, '9999_broken.sql'), 'CREATE TABLE half_done (id int);\nSELECT * FROM no_such_table;\n');
    await expect(migrate(sql, { ...quiet, dir })).rejects.toThrow(/no_such_table/);
    const applied = await sql<{ name: string }[]>`SELECT name FROM _migrations ORDER BY name`;
    expect(applied.map((r) => r.name)).toEqual(await shipped());
    const half = await sql`SELECT 1 FROM information_schema.tables WHERE table_name = 'half_done'`;
    expect(half).toHaveLength(0);

    await writeFile(join(dir, '9999_broken.sql'), 'CREATE TABLE half_done (id int);\n');
    const resumed = await migrate(sql, { ...quiet, dir });
    expect(resumed.applied).toEqual(['9999_broken.sql']);
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
    await writeFile(join(dir, '9999_newer.sql'), 'CREATE TABLE newer (id int);\n');
    await migrate(sql, { ...quiet, dir });
    const lines: string[] = [];
    const result = await migrate(sql, { log: (l) => lines.push(l) });
    expect(result.unknown).toEqual(['9999_newer.sql']);
    expect(lines.join('\n')).toContain('9999_newer.sql');
  });

  it('rejects badly named files', async () => {
    const { sql } = await db();
    const dir = await copyOfMigrations();
    await writeFile(join(dir, '2_oops.sql'), 'SELECT 1;');
    await expect(migrate(sql, { ...quiet, dir })).rejects.toThrow(/NNNN_lowercase_name/);
  });
});
