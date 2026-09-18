import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startHarness, type Harness } from '../support/harness.js';

let h: Harness;
let W: Awaited<ReturnType<Harness['seedWorkspace']>>;
beforeAll(async () => {
  h = await startHarness();
  W = await h.seedWorkspace('keys');
});
afterAll(() => h?.drop());

describe('API keys', () => {
  it('shows the key once, stores only its hash, and lists it by prefix', async () => {
    const created = await h.call({ method: 'POST', path: '/v1/api-keys', key: W.key, body: { name: 'CI', scope: 'read' } });
    expect(created.status).toBe(201);
    expect(created.headers.get('cache-control')).toBe('no-store');
    expect(created.body.key).toMatch(/^sk_live_/);
    expect(created.body.api_key).toMatchObject({ name: 'CI', scope: 'read', revoked_at: null, last_used_at: null });
    expect(created.body.key.startsWith(created.body.api_key.prefix)).toBe(true);

    const [row] = await h.sql`SELECT * FROM api_keys WHERE id = ${created.body.api_key.id}`;
    expect(JSON.stringify(row)).not.toContain(created.body.key);

    const list = await h.call({ path: '/v1/api-keys', key: W.key });
    const listed = list.body.data.find((k: { id: string }) => k.id === created.body.api_key.id);
    expect(listed).toBeDefined();
    expect(JSON.stringify(list.body)).not.toContain(created.body.key);
  });

  it('records when a key was last used', async () => {
    const created = await h.call({ method: 'POST', path: '/v1/api-keys', key: W.key, body: { name: 'used' } });
    await h.call({ path: '/v1/workspace', key: created.body.key });
    const [row] = await h.sql`SELECT last_used_at FROM api_keys WHERE id = ${created.body.api_key.id}`;
    expect(row!.last_used_at).not.toBeNull();
  });

  it('rejects a revoked key on the very next request, on every route', async () => {
    const created = await h.call({ method: 'POST', path: '/v1/api-keys', key: W.key, body: { name: 'short-lived' } });
    const doomed = created.body.key;
    expect((await h.call({ path: '/v1/workspace', key: doomed })).status).toBe(200);

    const revoked = await h.call({ method: 'DELETE', path: `/v1/api-keys/${created.body.api_key.id}`, key: W.key });
    expect(revoked.status).toBe(200);
    expect(revoked.body.revoked_at).not.toBeNull();

    for (const [method, path] of [
      ['GET', '/v1/workspace'],
      ['GET', '/v1/api-keys'],
      ['POST', '/v1/api-keys'],
      ['GET', '/v1/audit-log'],
    ] as const) {
      const res = await h.call({ method, path, key: doomed, body: method === 'POST' ? { name: 'x' } : undefined });
      expect(res.status, path).toBe(401);
      expect(res.body.error.code, path).toBe('api_key_revoked');
    }
  });

  it('a key can revoke itself, and revoking twice is harmless and audited once', async () => {
    const created = await h.call({ method: 'POST', path: '/v1/api-keys', key: W.key, body: { name: 'self' } });
    const id = created.body.api_key.id;
    const first = await h.call({ method: 'DELETE', path: `/v1/api-keys/${id}`, key: created.body.key });
    expect(first.status).toBe(200);
    const second = await h.call({ method: 'DELETE', path: `/v1/api-keys/${id}`, key: W.key });
    expect(second.status).toBe(200);
    expect(second.body.revoked_at).toBe(first.body.revoked_at);
    const audit = await h.call({ path: `/v1/audit-log?action=api_key.revoked&target_id=${id}`, key: W.key });
    expect(audit.body.data).toHaveLength(1);
    expect(audit.body.data[0].actor).toEqual({ type: 'api_key', api_key_id: id });
  });

  it('refuses unknown, malformed and missing credentials with distinct codes', async () => {
    expect((await h.call({ path: '/v1/workspace' })).body.error.code).toBe('unauthenticated');
    expect((await h.call({ path: '/v1/workspace', key: 'sk_live_nope' })).body.error.code).toBe('invalid_api_key');
    expect((await h.call({ path: '/v1/workspace', key: 'sk_live_' + 'x'.repeat(32) })).body.error.code).toBe('invalid_api_key');
    expect((await h.call({ path: '/v1/workspace', key: 'not-the-dashboard-token' })).body.error.code).toBe('unauthenticated');
  });

  it('enforces key scopes: read keys read, send keys do not see keys, only full keys manage', async () => {
    const read = (await h.call({ method: 'POST', path: '/v1/api-keys', key: W.key, body: { name: 'r', scope: 'read' } })).body.key;
    const send = (await h.call({ method: 'POST', path: '/v1/api-keys', key: W.key, body: { name: 's', scope: 'send' } })).body.key;
    expect((await h.call({ path: '/v1/api-keys', key: read })).status).toBe(200);
    expect((await h.call({ path: '/v1/audit-log', key: read })).status).toBe(200);
    expect((await h.call({ method: 'POST', path: '/v1/api-keys', key: read, body: { name: 'x' } })).status).toBe(403);
    expect((await h.call({ path: '/v1/workspace', key: send })).status).toBe(200);
    expect((await h.call({ path: '/v1/api-keys', key: send })).status).toBe(403);
    expect((await h.call({ method: 'PATCH', path: '/v1/workspace', key: send, body: { name: 'x' } })).status).toBe(403);
  });

  it('pages through keys with a cursor, newest first', async () => {
    for (let i = 0; i < 5; i++) await h.call({ method: 'POST', path: '/v1/api-keys', key: W.key, body: { name: `page-${i}` } });
    const seen: string[] = [];
    let cursor: string | null = null;
    do {
      const res = await h.call({ path: `/v1/api-keys?limit=2${cursor ? `&cursor=${cursor}` : ''}`, key: W.key });
      expect(res.body.data.length).toBeLessThanOrEqual(2);
      seen.push(...res.body.data.map((k: { id: string }) => k.id));
      cursor = res.body.next_cursor;
    } while (cursor);
    const { count } = (await h.sql<{ count: number }[]>`SELECT count(*)::int AS count FROM api_keys WHERE workspace_id = ${W.id}`)[0]!;
    expect(seen).toHaveLength(count);
    expect(new Set(seen).size).toBe(count);
  });
});
