import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startHarness, type Harness } from '../support/harness.js';

/**
 * Workspace A's credentials can never read or change workspace B's rows, on any
 * route. Every test acts as A and aims at B.
 */
let h: Harness;
let A: Awaited<ReturnType<Harness['seedWorkspace']>>;
let B: Awaited<ReturnType<Harness['seedWorkspace']>>;
let bMemberId: string;

beforeAll(async () => {
  h = await startHarness();
  A = await h.seedWorkspace('alpha');
  B = await h.seedWorkspace('bravo');
  const added = await h.call({
    method: 'POST',
    path: '/v1/members',
    subject: B.owner,
    workspace: B.id,
    body: { subject: 'bravo-editor', email: 'editor@bravo.io', role: 'editor' },
  });
  bMemberId = added.body.id;
});
afterAll(() => h?.drop());

describe('tenancy isolation', () => {
  it("GET /v1/workspace returns only the key's own workspace", async () => {
    const res = await h.call({ path: '/v1/workspace', key: A.key, headers: { 'x-mail-workspace': B.id } });
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(A.id);
  });

  it("PATCH /v1/workspace changes only the key's own workspace", async () => {
    const res = await h.call({ method: 'PATCH', path: '/v1/workspace', key: A.key, body: { name: 'Renamed by A' }, headers: { 'x-mail-workspace': B.id } });
    expect(res.status).toBe(200);
    const b = await h.call({ path: '/v1/workspace', key: B.key });
    expect(b.body.name).toBe('Workspace bravo');
  });

  it("GET /v1/api-keys never lists another workspace's keys", async () => {
    const res = await h.call({ path: '/v1/api-keys', key: A.key });
    expect(res.status).toBe(200);
    const ids = res.body.data.map((k: { id: string }) => k.id);
    expect(ids).toContain(A.keyId);
    expect(ids).not.toContain(B.keyId);
  });

  it('GET /v1/api-keys refuses a cursor from another workspace', async () => {
    const res = await h.call({ path: `/v1/api-keys?cursor=${B.keyId}`, key: A.key });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('invalid_cursor');
  });

  it("POST /v1/api-keys creates the key in the caller's workspace only", async () => {
    const res = await h.call({ method: 'POST', path: '/v1/api-keys', key: A.key, body: { name: 'second' }, headers: { 'x-mail-workspace': B.id } });
    expect(res.status).toBe(201);
    const bKeys = await h.call({ path: '/v1/api-keys', key: B.key });
    expect(bKeys.body.data.map((k: { id: string }) => k.id)).not.toContain(res.body.api_key.id);
    const who = await h.call({ path: '/v1/workspace', key: res.body.key });
    expect(who.body.id).toBe(A.id);
  });

  it("DELETE /v1/api-keys/:id cannot revoke another workspace's key", async () => {
    const res = await h.call({ method: 'DELETE', path: `/v1/api-keys/${B.keyId}`, key: A.key });
    expect(res.status).toBe(404);
    const stillWorks = await h.call({ path: '/v1/workspace', key: B.key });
    expect(stillWorks.status).toBe(200);
  });

  it("GET /v1/audit-log shows only the caller's workspace", async () => {
    const res = await h.call({ path: '/v1/audit-log?limit=100', key: A.key });
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
    const bIds = new Set((await h.call({ path: '/v1/audit-log?limit=100', key: B.key })).body.data.map((e: { id: string }) => e.id));
    for (const entry of res.body.data) expect(bIds.has(entry.id)).toBe(false);
    const targets = res.body.data.map((e: { target_id: string }) => e.target_id);
    expect(targets).not.toContain(B.id);
    expect(targets).not.toContain(B.keyId);
  });

  it('GET /v1/audit-log refuses a cursor from another workspace', async () => {
    const bEntry = (await h.call({ path: '/v1/audit-log', key: B.key })).body.data[0].id;
    const res = await h.call({ path: `/v1/audit-log?cursor=${bEntry}`, key: A.key });
    expect(res.body.error.code).toBe('invalid_cursor');
  });

  it('GET /v1/audit-log filtered by a target of another workspace finds nothing', async () => {
    const res = await h.call({ path: `/v1/audit-log?target_id=${B.keyId}`, key: A.key });
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it('a member of A cannot enter B through the dashboard, on any workspace route', async () => {
    for (const [method, path, body] of [
      ['GET', '/v1/workspace'],
      ['PATCH', '/v1/workspace', { name: 'x' }],
      ['GET', '/v1/api-keys'],
      ['POST', '/v1/api-keys', { name: 'x' }],
      ['DELETE', `/v1/api-keys/${B.keyId}`],
      ['GET', '/v1/audit-log'],
      ['GET', '/v1/members'],
      ['POST', '/v1/members', { subject: 'x', email: 'x@x.io', role: 'viewer' }],
      ['PATCH', `/v1/members/${bMemberId}`, { role: 'viewer' }],
      ['DELETE', `/v1/members/${bMemberId}`],
    ] as const) {
      const res = await h.call({ method, path, body, subject: A.owner, workspace: B.id });
      expect(res.status, `${method} ${path}`).toBe(403);
      expect(res.body.error.code, `${method} ${path}`).toBe('forbidden');
    }
  });

  it('members routes in A cannot address a member of B by id, by key or through the dashboard', async () => {
    for (const as of [{ subject: A.owner, workspace: A.id }, { key: A.key }]) {
      const patch = await h.call({ method: 'PATCH', path: `/v1/members/${bMemberId}`, ...as, body: { role: 'viewer' } });
      expect(patch.status).toBe(404);
      const del = await h.call({ method: 'DELETE', path: `/v1/members/${bMemberId}`, ...as });
      expect(del.status).toBe(404);
      const list = await h.call({ path: '/v1/members', ...as });
      expect(list.body.data.map((m: { id: string }) => m.id)).not.toContain(bMemberId);
      const cursor = await h.call({ path: `/v1/members?cursor=${bMemberId}`, ...as });
      expect(cursor.body.error.code).toBe('invalid_cursor');
    }
    const [row] = await h.sql`SELECT role FROM workspace_members WHERE id = ${bMemberId}`;
    expect(row!.role).toBe('editor');
  });

  it("POST /v1/members with A's key adds the person to A only", async () => {
    const res = await h.call({
      method: 'POST',
      path: '/v1/members',
      key: A.key,
      body: { subject: 'shared-person', email: 'p@alpha.io', role: 'viewer' },
      headers: { 'x-mail-workspace': B.id },
    });
    expect(res.status).toBe(201);
    const [row] = await h.sql`SELECT workspace_id FROM workspace_members WHERE id = ${res.body.id}`;
    expect(row!.workspace_id).toBe(A.id);
  });

  it("GET /v1/workspaces lists only the subject's own workspaces", async () => {
    const res = await h.call({ path: '/v1/workspaces', subject: A.owner });
    expect(res.body.data.map((w: { id: string }) => w.id)).toEqual([A.id]);
  });

  it('the dashboard-only routes refuse API keys outright', async () => {
    for (const [method, path, body] of [
      ['POST', '/v1/workspaces', { slug: 'x', name: 'x', owner: { email: 'x@x.io' } }],
      ['GET', '/v1/workspaces'],
    ] as const) {
      const res = await h.call({ method, path, body, key: A.key });
      expect(res.status, `${method} ${path}`).toBe(403);
      expect(res.body.error.code, `${method} ${path}`).toBe('forbidden');
    }
  });

  it('GET /v1/workspaces refuses a cursor naming a workspace the person is not in', async () => {
    const res = await h.call({ path: `/v1/workspaces?cursor=${B.id}`, subject: A.owner });
    expect(res.body.error.code).toBe('invalid_cursor');
  });

  it('the same Idempotency-Key in two workspaces are two different requests', async () => {
    const a = await h.call({ method: 'POST', path: '/v1/api-keys', key: A.key, idempotencyKey: 'shared-key', body: { name: 'idem' } });
    const b = await h.call({ method: 'POST', path: '/v1/api-keys', key: B.key, idempotencyKey: 'shared-key', body: { name: 'idem' } });
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    expect(b.headers.get('idempotent-replayed')).toBeNull();
    expect(a.body.key).not.toBe(b.body.key);
    expect((await h.call({ path: '/v1/workspace', key: b.body.key })).body.id).toBe(B.id);
  });
});
