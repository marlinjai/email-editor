import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { createSql } from '../../src/db.js';
import { DASHBOARD_TOKEN, SECRETS_KEYS, startHarness, type Harness } from '../support/harness.js';

let h: Harness;
let W: Awaited<ReturnType<Harness['seedWorkspace']>>;
beforeAll(async () => {
  h = await startHarness();
  W = await h.seedWorkspace('http');
});
afterAll(() => h?.drop());

describe('health', () => {
  it('answers 200 when the database answers', async () => {
    const res = await h.call({ path: '/healthz' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, database: 'up' });
    expect(typeof res.body.commit).toBe('string');
  });

  it('answers 503 when the database does not', async () => {
    const dead = createSql('postgres://nobody:nothing@127.0.0.1:1/none', { max: 1 });
    const app = createApp({ sql: dead, dashboardServiceToken: DASHBOARD_TOKEN, secretsKeys: SECRETS_KEYS, log: { error: () => {} } });
    const res = await app.request('/healthz');
    expect(res.status).toBe(503);
    expect(((await res.json()) as { database: string }).database).toBe('down');
    await dead.end({ timeout: 1 });
  });
});

describe('the error envelope', () => {
  it('malformed JSON is invalid_request', async () => {
    const res = await h.call({ method: 'POST', path: '/v1/api-keys', key: W.key, rawBody: '{"name":' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('invalid_request');
  });

  it('a wrong shape is validation_failed with the failing paths', async () => {
    const res = await h.call({ method: 'POST', path: '/v1/api-keys', key: W.key, body: { name: 42, scope: 'root' } });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('validation_failed');
    const paths = res.body.error.details.issues.map((i: { path: string[] }) => i.path.join('.'));
    expect(paths).toEqual(expect.arrayContaining(['name', 'scope']));
  });

  it('a body over 1 MB is payload_too_large', async () => {
    const res = await h.call({ method: 'POST', path: '/v1/api-keys', key: W.key, body: { name: 'x'.repeat(1024 * 1024 + 10) } });
    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe('payload_too_large');
  });

  it('an unknown route is a JSON not_found', async () => {
    const res = await h.call({ path: '/v1/nope', key: W.key });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('not_found');
  });

  it('an id this service never issued is not_found, never a database error', async () => {
    const res = await h.call({ method: 'DELETE', path: '/v1/api-keys/not-a-uuid', key: W.key });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('not_found');
  });

  it('every response carries a request id, and an incoming one is echoed', async () => {
    const res = await h.call({ path: '/v1/workspace', key: W.key, headers: { 'x-request-id': 'trace-123' } });
    expect(res.headers.get('x-request-id')).toBe('trace-123');
    const fresh = await h.call({ path: '/v1/workspace', key: W.key });
    expect(fresh.headers.get('x-request-id')).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('an unexpected failure is internal_error with the request id, and is logged', async () => {
    const broken = createSql('postgres://nobody:nothing@127.0.0.1:1/none', { max: 1 });
    const logged: unknown[] = [];
    const app = createApp({ sql: broken, dashboardServiceToken: DASHBOARD_TOKEN, secretsKeys: SECRETS_KEYS, log: { error: (...a: unknown[]) => logged.push(a) } });
    const res = await app.request('/v1/workspace', { headers: { authorization: `Bearer ${W.key}` } });
    const body = (await res.json()) as { error: { code: string; details: { request_id: string } } };
    expect(res.status).toBe(500);
    expect(body.error.code).toBe('internal_error');
    expect(body.error.details.request_id).toBe(res.headers.get('x-request-id'));
    expect(logged).toHaveLength(1);
    await broken.end({ timeout: 1 });
  });

  it('the audit log pages without gaps or repeats', async () => {
    for (let i = 0; i < 7; i++) await h.call({ method: 'PATCH', path: '/v1/workspace', key: W.key, body: { name: `n${i}` } });
    const seen: string[] = [];
    let cursor: string | null = null;
    do {
      const res = await h.call({ path: `/v1/audit-log?limit=3${cursor ? `&cursor=${cursor}` : ''}`, key: W.key });
      seen.push(...res.body.data.map((e: { id: string }) => e.id));
      cursor = res.body.next_cursor;
    } while (cursor);
    const { n } = (await h.sql<{ n: number }[]>`SELECT count(*)::int AS n FROM audit_log WHERE workspace_id = ${W.id}`)[0]!;
    expect(seen).toHaveLength(n);
    expect(new Set(seen).size).toBe(n);
  });
});
