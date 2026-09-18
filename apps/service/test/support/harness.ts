import { createApp } from '../../src/app.js';
import type { Sql } from '../../src/db.js';
import { migrate } from '../../src/migrate.js';
import { freshDatabase } from './db.js';

export const DASHBOARD_TOKEN = 'a'.repeat(64);

type Json = Record<string, any>;

export type Call = {
  method?: string;
  path: string;
  body?: unknown;
  rawBody?: string;
  key?: string;
  /** Act as this auth-brain subject through the dashboard. */
  subject?: string;
  workspace?: string;
  idempotencyKey?: string;
  headers?: Record<string, string>;
};

export type Result = { status: number; body: Json; headers: Headers };

/** A migrated database and the app over it, driven in-process through app.request. */
export async function startHarness() {
  const db = await freshDatabase();
  await migrate(db.sql, { log: () => {} });
  const errors: unknown[] = [];
  const app = createApp({ sql: db.sql, dashboardServiceToken: DASHBOARD_TOKEN, log: { error: (...a) => errors.push(a) } });

  async function call(c: Call): Promise<Result> {
    const headers: Record<string, string> = { ...(c.headers ?? {}) };
    if (c.key) headers.authorization = `Bearer ${c.key}`;
    if (c.subject) {
      headers.authorization = `Bearer ${DASHBOARD_TOKEN}`;
      headers['x-mail-subject'] = c.subject;
    }
    if (c.workspace) headers['x-mail-workspace'] = c.workspace;
    if (c.idempotencyKey) headers['idempotency-key'] = c.idempotencyKey;
    let body: string | undefined;
    if (c.rawBody !== undefined) body = c.rawBody;
    else if (c.body !== undefined) body = JSON.stringify(c.body);
    if (body !== undefined) headers['content-type'] = 'application/json';
    const res = await app.request(c.path, { method: c.method ?? 'GET', headers, body });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : {}, headers: res.headers };
  }

  /** A workspace with an owner (subject `owner-<slug>`) and a full-scope key. */
  async function seedWorkspace(slug: string) {
    const owner = `owner-${slug}`;
    const ws = await call({
      method: 'POST',
      path: '/v1/workspaces',
      subject: owner,
      body: { slug, name: `Workspace ${slug}`, owner: { email: `${owner}@example.com`, name: 'Owner' } },
    });
    if (ws.status !== 201) throw new Error(`seed ${slug}: ${JSON.stringify(ws.body)}`);
    const key = await call({
      method: 'POST',
      path: '/v1/api-keys',
      subject: owner,
      workspace: ws.body.id,
      body: { name: `${slug} key` },
    });
    if (key.status !== 201) throw new Error(`seed key ${slug}: ${JSON.stringify(key.body)}`);
    return { id: ws.body.id as string, owner, key: key.body.key as string, keyId: key.body.api_key.id as string };
  }

  return { sql: db.sql as Sql, app, call, seedWorkspace, errors, drop: db.drop, url: db.url };
}
export type Harness = Awaited<ReturnType<typeof startHarness>>;
