import { createApp } from '../../src/app.js';
import { CompilePool } from '../../src/compile/pool.js';
import type { Sql } from '../../src/db.js';
import { migrate } from '../../src/migrate.js';
import { createSealer, type Sealer } from '../../src/sealing.js';
import type { SsrfPolicy } from '../../src/webhooks/ssrf.js';
import { freshDatabase } from './db.js';
import { MemoryAssetStorage } from './fakes.js';

export const DASHBOARD_TOKEN = 'a'.repeat(64);
export const SECRETS_KEYS = new Map([[1, Buffer.alloc(32, 7)]]);
export const PUBLIC_BASE_URL = 'https://mail.test';
export const COMPILE_WORKER_URL = new URL('../../src/compile-worker.js', import.meta.url);

type Json = Record<string, any>;

export type Call = {
  method?: string;
  path: string;
  body?: unknown;
  rawBody?: string;
  /** A multipart body; the content type with its boundary is set by the request. */
  form?: FormData;
  key?: string;
  /** Act as this auth-brain subject through the dashboard. */
  subject?: string;
  workspace?: string;
  idempotencyKey?: string;
  headers?: Record<string, string>;
};

export type Result = { status: number; body: Json; headers: Headers };

/** A migrated database and the app over it, driven in-process through app.request. */
export async function startHarness(options: { webhookUrlPolicy?: SsrfPolicy } = {}) {
  const db = await freshDatabase();
  await migrate(db.sql, { log: () => {} });
  const errors: unknown[] = [];
  const compiler = new CompilePool({ workerUrl: COMPILE_WORKER_URL, size: 2, timeoutMs: 20_000, maxQueue: 16 });
  const storage = new MemoryAssetStorage();
  /** What every app over this database shares: the compile pool and the image store. */
  const appDeps = { compiler, assetStorage: storage, publicBaseUrl: PUBLIC_BASE_URL };
  const log = { error: (...a: unknown[]) => errors.push(a) };
  /** A second, independent app over the same database: a service restart. */
  const restart = () =>
    createApp({ sql: db.sql, dashboardServiceToken: DASHBOARD_TOKEN, secretsKeys: SECRETS_KEYS, webhookUrlPolicy: options.webhookUrlPolicy, log, ...appDeps });
  let app = restart();
  const sealer: Sealer = createSealer(SECRETS_KEYS);

  async function call(c: Call): Promise<Result> {
    const headers: Record<string, string> = { ...(c.headers ?? {}) };
    if (c.key) headers.authorization = `Bearer ${c.key}`;
    if (c.subject) {
      headers.authorization = `Bearer ${DASHBOARD_TOKEN}`;
      headers['x-mail-subject'] = c.subject;
    }
    if (c.workspace) headers['x-mail-workspace'] = c.workspace;
    if (c.idempotencyKey) headers['idempotency-key'] = c.idempotencyKey;
    let body: string | FormData | undefined;
    if (c.form !== undefined) body = c.form;
    else if (c.rawBody !== undefined) body = c.rawBody;
    else if (c.body !== undefined) body = JSON.stringify(c.body);
    if (typeof body === 'string' && headers['content-type'] === undefined) headers['content-type'] = 'application/json';
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

  return {
    sql: db.sql as Sql,
    get app() {
      return app;
    },
    /** Replaces the app with a fresh instance over the same database, as a process restart would. */
    restartApp() {
      app = restart();
    },
    call,
    seedWorkspace,
    errors,
    compiler,
    storage,
    appDeps,
    drop: async () => {
      await compiler.close();
      await db.drop();
    },
    url: db.url,
    sealer,
  };
}
export type Harness = Awaited<ReturnType<typeof startHarness>>;
