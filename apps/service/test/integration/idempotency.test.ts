import { Hono } from 'hono';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import type { AppEnv } from '../../src/context.js';
import { idempotent, workspaceScope } from '../../src/idempotency.js';
import { repos } from '../../src/repo/index.js';
import { createSealer } from '../../src/sealing.js';
import { DASHBOARD_TOKEN, SECRETS_KEYS, startHarness, type Harness } from '../support/harness.js';

/**
 * The idempotency ledger is a stateful flow, so it is tested on the four paths
 * of the stateful-flow standard: forward, backtrack-and-revise, resume from
 * persistence, and re-entry after completion or failure.
 */
let h: Harness;
let W: Awaited<ReturnType<Harness['seedWorkspace']>>;
beforeAll(async () => {
  h = await startHarness();
  W = await h.seedWorkspace('idem');
});
afterAll(() => h?.drop());

const keyCount = async () =>
  (await h.sql`SELECT count(*)::int AS n FROM api_keys WHERE workspace_id = ${W.id}`)[0]!.n as number;

describe('idempotency: forward', () => {
  it('a replay returns the same response, marked as a replay, and creates nothing new', async () => {
    const before = await keyCount();
    const first = await h.call({ method: 'POST', path: '/v1/api-keys', key: W.key, idempotencyKey: 'fwd-1', body: { name: 'once' } });
    const second = await h.call({ method: 'POST', path: '/v1/api-keys', key: W.key, idempotencyKey: 'fwd-1', body: { name: 'once' } });
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.body).toEqual(first.body);
    expect(first.headers.get('idempotent-replayed')).toBeNull();
    expect(second.headers.get('idempotent-replayed')).toBe('true');
    expect(await keyCount()).toBe(before + 1);
    const audit = await h.call({ path: `/v1/audit-log?action=api_key.created&target_id=${first.body.api_key.id}`, key: W.key });
    expect(audit.body.data).toHaveLength(1);
  });

  it('a request without the header just runs every time', async () => {
    const before = await keyCount();
    await h.call({ method: 'POST', path: '/v1/api-keys', key: W.key, body: { name: 'plain' } });
    await h.call({ method: 'POST', path: '/v1/api-keys', key: W.key, body: { name: 'plain' } });
    expect(await keyCount()).toBe(before + 2);
  });

  it('two concurrent requests with one key: one runs, the other is refused or replayed, never both run', async () => {
    const before = await keyCount();
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        h.call({ method: 'POST', path: '/v1/api-keys', key: W.key, idempotencyKey: 'burst', body: { name: 'burst' } }),
      ),
    );
    expect(await keyCount()).toBe(before + 1);
    for (const r of results) expect([201, 409]).toContain(r.status);
    const conflicts = results.filter((r) => r.status === 409);
    for (const c of conflicts) expect(c.body.error.code).toBe('conflict');
  });
});

describe('idempotency: backtrack and revise', () => {
  it('the same key with a different body is refused, not replayed', async () => {
    await h.call({ method: 'POST', path: '/v1/api-keys', key: W.key, idempotencyKey: 'rev-1', body: { name: 'original' } });
    const revised = await h.call({ method: 'POST', path: '/v1/api-keys', key: W.key, idempotencyKey: 'rev-1', body: { name: 'changed' } });
    expect(revised.status).toBe(409);
    expect(revised.body.error.code).toBe('idempotency_key_reused');
  });

  it('the same key on a different route is refused', async () => {
    await h.call({ method: 'PATCH', path: '/v1/workspace', key: W.key, idempotencyKey: 'rev-2', body: { name: 'N' } });
    const other = await h.call({ method: 'POST', path: '/v1/api-keys', key: W.key, idempotencyKey: 'rev-2', body: { name: 'N' } });
    expect(other.body.error.code).toBe('idempotency_key_reused');
  });

  it('the revised request under a new key runs', async () => {
    const res = await h.call({ method: 'POST', path: '/v1/api-keys', key: W.key, idempotencyKey: 'rev-1b', body: { name: 'changed' } });
    expect(res.status).toBe(201);
    expect(res.body.api_key.name).toBe('changed');
  });

  it('a client error is remembered too: the same invalid request replays its 4xx', async () => {
    const bad = await h.call({ method: 'POST', path: '/v1/api-keys', key: W.key, idempotencyKey: 'rev-3', body: { name: '' } });
    expect(bad.body.error.code).toBe('validation_failed');
    const again = await h.call({ method: 'POST', path: '/v1/api-keys', key: W.key, idempotencyKey: 'rev-3', body: { name: '' } });
    expect(again.headers.get('idempotent-replayed')).toBe('true');
    expect(again.body).toEqual(bad.body);
  });
});

describe('idempotency: resume from persistence', () => {
  it('a second service instance replays what the first one stored', async () => {
    const first = await h.call({ method: 'POST', path: '/v1/api-keys', key: W.key, idempotencyKey: 'res-1', body: { name: 'restart' } });
    const restarted = createApp({ sql: h.sql, dashboardServiceToken: DASHBOARD_TOKEN, secretsKeys: SECRETS_KEYS, ...h.appDeps });
    const res = await restarted.request('/v1/api-keys', {
      method: 'POST',
      headers: { authorization: `Bearer ${W.key}`, 'idempotency-key': 'res-1', 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'restart' }),
    });
    expect(res.headers.get('idempotent-replayed')).toBe('true');
    expect(await res.json()).toEqual(first.body);
  });

  it('a claim left in progress by a crashed process is refused while fresh, and cleared once stale', async () => {
    const hash = 'deadbeef';
    await h.sql`
      INSERT INTO idempotency_keys (scope, workspace_id, key, request_hash, state)
      VALUES (${`ws:${W.id}`}, ${W.id}, 'res-2', ${hash}, 'in_progress')`;
    // Fresh: the request with the matching fingerprint is still "running".
    const ledger = repos(h.sql).idempotency;
    const claim = await ledger.claim(W.id, `ws:${W.id}`, 'res-2', hash);
    expect(claim.claimed).toBe(false);

    await h.sql`UPDATE idempotency_keys SET created_at = now() - interval '10 minutes' WHERE key = 'res-2'`;
    const before = await keyCount();
    const retry = await h.call({ method: 'POST', path: '/v1/api-keys', key: W.key, idempotencyKey: 'res-2', body: { name: 'after crash' } });
    expect(retry.status).toBe(201);
    expect(await keyCount()).toBe(before + 1);
  });

  it('a key past its 24 hour retention is forgotten', async () => {
    await h.call({ method: 'POST', path: '/v1/api-keys', key: W.key, idempotencyKey: 'res-3', body: { name: 'old' } });
    await h.sql`UPDATE idempotency_keys SET created_at = now() - interval '25 hours' WHERE key = 'res-3'`;
    const again = await h.call({ method: 'POST', path: '/v1/api-keys', key: W.key, idempotencyKey: 'res-3', body: { name: 'old' } });
    expect(again.headers.get('idempotent-replayed')).toBeNull();
    expect(await repos(h.sql).idempotency.purgeExpired()).toBe(0);
  });
});

describe('idempotency: re-entry after completion or failure', () => {
  it('a server error releases the key, so the retry runs', async () => {
    let fail = true;
    const app = new Hono<AppEnv>();
    const ledger = repos(h.sql).idempotency;
    app.onError((_err, c) => c.json({ error: { code: 'internal_error', message: 'x' } }, 500));
    app.use('*', async (c, next) => {
      c.set('access', { workspaceId: W.id, via: 'api_key', apiKeyId: W.keyId, scope: 'full' });
      await next();
    });
    app.post('/flaky', idempotent(() => ledger, createSealer(SECRETS_KEYS), workspaceScope), (c) => {
      if (fail) throw new Error('database went away');
      return c.json({ done: true }, 201);
    });
    const req = () => app.request('/flaky', { method: 'POST', headers: { 'idempotency-key': 'reent-1' }, body: '{}' });
    expect((await req()).status).toBe(500);
    fail = false;
    const retried = await req();
    expect(retried.status).toBe(201);
    const replay = await req();
    expect(replay.headers.get('idempotent-replayed')).toBe('true');
  });

  it('after completion, the key keeps answering with the first response even when state has moved on', async () => {
    const created = await h.call({ method: 'POST', path: '/v1/api-keys', key: W.key, body: { name: 'to revoke' } });
    const id = created.body.api_key.id;
    const first = await h.call({ method: 'DELETE', path: `/v1/api-keys/${id}`, key: W.key, idempotencyKey: 'reent-2' });
    const replay = await h.call({ method: 'DELETE', path: `/v1/api-keys/${id}`, key: W.key, idempotencyKey: 'reent-2' });
    expect(replay.body).toEqual(first.body);
  });

  it('workspace creation is idempotent per acting person', async () => {
    const body = { slug: 'idem-created', name: 'I', owner: { email: 'i@i.io' } };
    const a = await h.call({ method: 'POST', path: '/v1/workspaces', subject: 'idem-person', idempotencyKey: 'ws-1', body });
    const b = await h.call({ method: 'POST', path: '/v1/workspaces', subject: 'idem-person', idempotencyKey: 'ws-1', body });
    expect(b.body).toEqual(a.body);
    expect(b.headers.get('idempotent-replayed')).toBe('true');
    // Another person with the same key is a different request (and hits the taken slug).
    const other = await h.call({ method: 'POST', path: '/v1/workspaces', subject: 'someone-else', idempotencyKey: 'ws-1', body });
    expect(other.body.error.code).toBe('already_exists');
  });

  it('rejects a malformed key header', async () => {
    const res = await h.call({ method: 'POST', path: '/v1/api-keys', key: W.key, idempotencyKey: 'x'.repeat(256), body: { name: 'x' } });
    expect(res.body.error.code).toBe('invalid_request');
  });
});
