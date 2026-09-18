import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';
import { hashApiKey, mintApiKey } from '../../src/api-key.js';
import { authenticate, MANAGE, permit, READ_ADMIN, requireWorkspace, type AuthDeps } from '../../src/auth.js';
import type { AppEnv } from '../../src/context.js';
import { ApiError } from '../../src/errors.js';
import type { Member } from '../../src/repo/members.js';

const TOKEN = 'f'.repeat(64);
const WS = '11111111-1111-4111-8111-111111111111';

function member(role: Member['role']): Member {
  return { id: 'm1', subject: 'alice', email: 'a@x.io', name: null, role, created_at: new Date().toISOString() };
}

async function setup(overrides: Partial<AuthDeps> = {}) {
  const good = await mintApiKey();
  const deps: AuthDeps = {
    dashboardServiceToken: TOKEN,
    findCredentialByHash: vi.fn(async (hash) =>
      hash === good.hash ? { id: 'k1', workspace_id: WS, key_hash: good.hash, scope: 'full' as const, revoked_at: null } : null,
    ),
    touchApiKey: vi.fn(async () => {}),
    findMember: vi.fn(async (ws, subject) => (ws === WS && subject === 'alice' ? member('editor') : null)),
    ...overrides,
  };
  const app = new Hono<AppEnv>();
  app.onError((err, c) => (err instanceof ApiError ? c.json(err.toBody(), err.status as 400) : c.json({ boom: String(err) }, 500)));
  app.use('*', authenticate(deps));
  app.get('/who', (c) => c.json(c.get('caller')));
  app.get('/ws', requireWorkspace(deps), (c) => c.json(c.get('access')));
  app.get('/admin-read', requireWorkspace(deps), permit(READ_ADMIN), (c) => c.json({ ok: true }));
  app.get('/manage', requireWorkspace(deps), permit(MANAGE), (c) => c.json({ ok: true }));
  return { app, deps, good };
}

async function code(res: Response) {
  return ((await res.json()) as { error?: { code: string } }).error?.code;
}

describe('authenticate', () => {
  it('rejects a request without credentials', async () => {
    const { app } = await setup();
    const res = await app.request('/who');
    expect(res.status).toBe(401);
    expect(await code(res)).toBe('unauthenticated');
  });

  it('accepts a valid key, binds its workspace and records its use', async () => {
    const { app, deps, good } = await setup();
    const res = await app.request('/ws', { headers: { authorization: `Bearer ${good.key}` } });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ workspaceId: WS, via: 'api_key', apiKeyId: 'k1', scope: 'full' });
    expect(deps.touchApiKey).toHaveBeenCalledWith(WS, 'k1');
  });

  it('ignores x-mail-workspace for a key: a key can never name another workspace', async () => {
    const { app, good } = await setup();
    const res = await app.request('/ws', {
      headers: { authorization: `Bearer ${good.key}`, 'x-mail-workspace': '22222222-2222-4222-8222-222222222222' },
    });
    expect(((await res.json()) as { workspaceId: string }).workspaceId).toBe(WS);
  });

  it('rejects a malformed key without a database lookup', async () => {
    const { app, deps } = await setup();
    const res = await app.request('/who', { headers: { authorization: 'Bearer sk_live_short' } });
    expect(await code(res)).toBe('invalid_api_key');
    expect(deps.findCredentialByHash).not.toHaveBeenCalled();
  });

  it('rejects an unknown key', async () => {
    const { app } = await setup();
    const other = await mintApiKey();
    const res = await app.request('/who', { headers: { authorization: `Bearer ${other.key}` } });
    expect(res.status).toBe(401);
    expect(await code(res)).toBe('invalid_api_key');
  });

  it('rejects a revoked key and does not record its use', async () => {
    const revoked = await mintApiKey();
    const touch = vi.fn(async () => {});
    const { app } = await setup({
      touchApiKey: touch,
      findCredentialByHash: async (hash) =>
        hash === (await hashApiKey(revoked.key))
          ? { id: 'k2', workspace_id: WS, key_hash: hash, scope: 'full', revoked_at: new Date().toISOString() }
          : null,
    });
    const res = await app.request('/who', { headers: { authorization: `Bearer ${revoked.key}` } });
    expect(res.status).toBe(401);
    expect(await code(res)).toBe('api_key_revoked');
    expect(touch).not.toHaveBeenCalled();
  });

  it('rejects a wrong dashboard token', async () => {
    const { app } = await setup();
    const res = await app.request('/who', { headers: { authorization: `Bearer ${'e'.repeat(64)}`, 'x-mail-subject': 'alice' } });
    expect(await code(res)).toBe('unauthenticated');
  });

  it('requires the acting subject on a dashboard call', async () => {
    const { app } = await setup();
    const res = await app.request('/who', { headers: { authorization: `Bearer ${TOKEN}` } });
    expect(res.status).toBe(400);
    expect(await code(res)).toBe('invalid_request');
  });

  it('lets the dashboard act for a member of the named workspace, with their role', async () => {
    const { app } = await setup();
    const res = await app.request('/ws', {
      headers: { authorization: `Bearer ${TOKEN}`, 'x-mail-subject': 'alice', 'x-mail-workspace': WS },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ workspaceId: WS, via: 'member', role: 'editor' });
  });

  it('refuses the dashboard acting for a non-member', async () => {
    const { app } = await setup();
    const res = await app.request('/ws', {
      headers: { authorization: `Bearer ${TOKEN}`, 'x-mail-subject': 'mallory', 'x-mail-workspace': WS },
    });
    expect(res.status).toBe(403);
    expect(await code(res)).toBe('forbidden');
  });

  it('requires a well-formed workspace id on a dashboard call', async () => {
    const { app } = await setup();
    const res = await app.request('/ws', {
      headers: { authorization: `Bearer ${TOKEN}`, 'x-mail-subject': 'alice', 'x-mail-workspace': "1' OR 1=1" },
    });
    expect(await code(res)).toBe('invalid_request');
  });
});

describe('permit', () => {
  it('turns a role below the minimum into insufficient_role', async () => {
    const { app } = await setup();
    const res = await app.request('/manage', {
      headers: { authorization: `Bearer ${TOKEN}`, 'x-mail-subject': 'alice', 'x-mail-workspace': WS },
    });
    expect(res.status).toBe(403);
    expect(await code(res)).toBe('insufficient_role');
  });

  it('checks a key by scope', async () => {
    const readKey = await mintApiKey();
    const { app } = await setup({
      findCredentialByHash: async (hash) =>
        hash === readKey.hash ? { id: 'k3', workspace_id: WS, key_hash: hash, scope: 'read', revoked_at: null } : null,
    });
    const headers = { authorization: `Bearer ${readKey.key}` };
    expect((await app.request('/admin-read', { headers })).status).toBe(200);
    const res = await app.request('/manage', { headers });
    expect(res.status).toBe(403);
    expect(await code(res)).toBe('forbidden');
  });
});
