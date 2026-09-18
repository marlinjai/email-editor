import { randomBytes } from 'node:crypto';
import postgres from 'postgres';
import { createSql, type Sql } from '../../src/db.js';

/** A fresh, empty database on the run's Postgres, and a way to drop it. */
export async function freshDatabase(): Promise<{ url: string; sql: Sql; drop: () => Promise<void> }> {
  const adminUrl = process.env.TEST_PG_ADMIN_URL;
  if (!adminUrl) throw new Error('TEST_PG_ADMIN_URL is not set: the global setup did not run.');
  const name = `t_${randomBytes(6).toString('hex')}`;
  const admin = postgres(adminUrl, { max: 1, onnotice: () => {} });
  await admin.unsafe(`CREATE DATABASE ${name}`);
  const url = new URL(adminUrl);
  url.pathname = `/${name}`;
  const sql = createSql(url.toString(), { max: 10 });
  return {
    url: url.toString(),
    sql,
    drop: async () => {
      await sql.end({ timeout: 5 });
      await admin.unsafe(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
      await admin.end({ timeout: 5 });
    },
  };
}
