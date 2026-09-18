import { createApp, type AppOptions } from '../../src/app.js';
import { DASHBOARD_TOKEN, SECRETS_KEYS, type Call, type Harness, type Result } from './harness.js';

/**
 * A second app over the harness database with options of its own (a verify
 * timeout, a fake fetch), driven the way the harness drives its app. Also how a
 * test simulates a restart: a new app over the same database.
 */
export function appOver(h: Harness, options: Partial<AppOptions> = {}) {
  const logged: unknown[] = [];
  const app = createApp({
    sql: h.sql,
    ...h.appDeps,
    dashboardServiceToken: DASHBOARD_TOKEN,
    secretsKeys: SECRETS_KEYS,
    log: { error: (...a: unknown[]) => logged.push(a) },
    ...options,
  });

  async function call(c: Call): Promise<Result> {
    const headers: Record<string, string> = { ...(c.headers ?? {}) };
    if (c.key) headers.authorization = `Bearer ${c.key}`;
    if (c.subject) {
      headers.authorization = `Bearer ${DASHBOARD_TOKEN}`;
      headers['x-mail-subject'] = c.subject;
    }
    if (c.workspace) headers['x-mail-workspace'] = c.workspace;
    if (c.idempotencyKey) headers['idempotency-key'] = c.idempotencyKey;
    const body = c.rawBody ?? (c.body === undefined ? undefined : JSON.stringify(c.body));
    if (body !== undefined) headers['content-type'] = 'application/json';
    const res = await app.request(c.path, { method: c.method ?? 'GET', headers, body });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : {}, headers: res.headers };
  }

  return { app, call, logged };
}
