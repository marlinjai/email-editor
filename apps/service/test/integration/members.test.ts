import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startHarness, type Harness } from '../support/harness.js';
import { setExemption } from '../../src/billing/exempt.js';

let h: Harness;
beforeAll(async () => {
  h = await startHarness();
});
afterAll(() => h?.drop());

async function workspaceWith(slug: string, others: Array<{ subject: string; role: string }>) {
  const W = await h.seedWorkspace(slug);
  const ids: Record<string, string> = {};
  const owner = await h.call({ path: '/v1/members', subject: W.owner, workspace: W.id });
  ids[W.owner] = owner.body.data[0].id;
  for (const o of others) {
    const res = await h.call({
      method: 'POST',
      path: '/v1/members',
      subject: W.owner,
      workspace: W.id,
      body: { subject: o.subject, email: `${o.subject}@${slug}.io`, role: o.role },
    });
    if (res.status !== 201) throw new Error(JSON.stringify(res.body));
    ids[o.subject] = res.body.id;
  }
  const as = (subject: string) => ({ subject, workspace: W.id });
  return { W, ids, as };
}

describe('last-owner rule', () => {
  it('the only owner can neither be demoted, removed, nor leave', async () => {
    const { W, ids, as } = await workspaceWith('solo', []);
    const demote = await h.call({ method: 'PATCH', path: `/v1/members/${ids[W.owner]}`, ...as(W.owner), body: { role: 'admin' } });
    expect(demote.status).toBe(409);
    expect(demote.body.error.code).toBe('last_owner');
    const leave = await h.call({ method: 'DELETE', path: `/v1/members/${ids[W.owner]}`, ...as(W.owner) });
    expect(leave.body.error.code).toBe('last_owner');
    const { count } = (await h.sql<{ count: number }[]>`SELECT count(*)::int AS count FROM workspace_members WHERE workspace_id = ${W.id} AND role = 'owner'`)[0]!;
    expect(count).toBe(1);
  });

  it('with a second owner, one can step down, and then the other becomes the last', async () => {
    const { W, ids, as } = await workspaceWith('duo', [{ subject: 'co', role: 'owner' }]);
    const stepDown = await h.call({ method: 'PATCH', path: `/v1/members/${ids.co}`, ...as('co'), body: { role: 'admin' } });
    expect(stepDown.status).toBe(200);
    expect(stepDown.body.role).toBe('admin');
    const now = await h.call({ method: 'DELETE', path: `/v1/members/${ids[W.owner]}`, ...as(W.owner) });
    expect(now.body.error.code).toBe('last_owner');
  });

  it('two owners demoting each other at the same instant: exactly one wins', async () => {
    const { W, ids, as } = await workspaceWith('race', [{ subject: 'rival', role: 'owner' }]);
    const results = await Promise.all([
      h.call({ method: 'PATCH', path: `/v1/members/${ids.rival}`, ...as(W.owner), body: { role: 'viewer' } }),
      h.call({ method: 'PATCH', path: `/v1/members/${ids[W.owner]}`, ...as('rival'), body: { role: 'viewer' } }),
    ]);
    const statuses = results.map((r) => r.status).sort();
    // The loser either hits last_owner or, if it was already demoted, lacks the owner role by then.
    expect(statuses[0]).toBe(200);
    expect([403, 409]).toContain(statuses[1]);
    const { count } = (await h.sql<{ count: number }[]>`SELECT count(*)::int AS count FROM workspace_members WHERE workspace_id = ${W.id} AND role = 'owner'`)[0]!;
    expect(count).toBe(1);
  });
});

describe('role rules', () => {
  it('an admin manages editors and viewers but cannot touch owners', async () => {
    const { W, ids, as } = await workspaceWith('roles', [
      { subject: 'adm', role: 'admin' },
      { subject: 'ed', role: 'editor' },
    ]);
    expect((await h.call({ method: 'PATCH', path: `/v1/members/${ids.ed}`, ...as('adm'), body: { role: 'viewer' } })).status).toBe(200);
    const promote = await h.call({ method: 'PATCH', path: `/v1/members/${ids.ed}`, ...as('adm'), body: { role: 'owner' } });
    expect(promote.body.error.code).toBe('insufficient_role');
    const addOwner = await h.call({ method: 'POST', path: '/v1/members', ...as('adm'), body: { subject: 'new', email: 'new@roles.io', role: 'owner' } });
    expect(addOwner.body.error.code).toBe('insufficient_role');
    const demoteOwner = await h.call({ method: 'PATCH', path: `/v1/members/${ids[W.owner]}`, ...as('adm'), body: { role: 'viewer' } });
    expect(demoteOwner.body.error.code).toBe('insufficient_role');
    const removeOwner = await h.call({ method: 'DELETE', path: `/v1/members/${ids[W.owner]}`, ...as('adm') });
    expect(removeOwner.body.error.code).toBe('insufficient_role');
  });

  it('editors and viewers can read the workspace and its people but change nothing', async () => {
    const { ids, as } = await workspaceWith('readers', [
      { subject: 'viewer1', role: 'viewer' },
      { subject: 'editor1', role: 'editor' },
    ]);
    expect((await h.call({ path: '/v1/workspace', ...as('viewer1') })).status).toBe(200);
    expect((await h.call({ path: '/v1/members', ...as('viewer1') })).status).toBe(200);
    for (const [method, path, body] of [
      ['PATCH', '/v1/workspace', { name: 'x' }],
      ['POST', '/v1/api-keys', { name: 'x' }],
      ['GET', '/v1/api-keys'],
      ['GET', '/v1/audit-log'],
      ['POST', '/v1/members', { subject: 'x', email: 'x@x.io', role: 'viewer' }],
      ['PATCH', `/v1/members/${ids.viewer1}`, { role: 'admin' }],
      ['DELETE', `/v1/members/${ids.viewer1}`],
    ] as const) {
      const res = await h.call({ method, path, body, ...as('editor1') });
      expect(res.status, `${method} ${path}`).toBe(403);
      expect(res.body.error.code, `${method} ${path}`).toBe('insufficient_role');
    }
  });

  it('anyone may leave; a removed person loses access on the next request', async () => {
    const { W, ids, as } = await workspaceWith('leavers', [
      { subject: 'leaver', role: 'viewer' },
      { subject: 'kicked', role: 'editor' },
    ]);
    expect((await h.call({ method: 'DELETE', path: `/v1/members/${ids.leaver}`, ...as('leaver') })).status).toBe(200);
    expect((await h.call({ path: '/v1/workspace', ...as('leaver') })).body.error.code).toBe('forbidden');
    expect((await h.call({ method: 'DELETE', path: `/v1/members/${ids.kicked}`, ...as(W.owner) })).status).toBe(200);
    expect((await h.call({ path: '/v1/workspace', ...as('kicked') })).body.error.code).toBe('forbidden');
    const audit = await h.call({ path: '/v1/audit-log?action=member.removed', ...as(W.owner) });
    expect(audit.body.data.map((e: { details: { left: boolean } }) => e.details.left).sort()).toEqual([false, true]);
  });

  it('refuses a duplicate member (same subject or same email)', async () => {
    const { W, as } = await workspaceWith('dupes', [{ subject: 'once', role: 'viewer' }]);
    const sameSubject = await h.call({ method: 'POST', path: '/v1/members', ...as(W.owner), body: { subject: 'once', email: 'other@dupes.io', role: 'viewer' } });
    expect(sameSubject.body.error.code).toBe('already_exists');
    const sameEmail = await h.call({ method: 'POST', path: '/v1/members', ...as(W.owner), body: { subject: 'twice', email: 'ONCE@dupes.io', role: 'viewer' } });
    expect(sameEmail.body.error.code).toBe('already_exists');
  });
});

describe('workspaces', () => {
  it('creating makes the acting person the owner and writes the audit trail', async () => {
    const res = await h.call({ method: 'POST', path: '/v1/workspaces', subject: 'founder', body: { slug: 'fresh', name: 'Fresh', owner: { email: 'Founder@Fresh.io' } } });
    expect(res.status).toBe(201);
    expect(res.body.settings).toEqual({ default_locale: 'en', locales: ['en'], tracking_enabled: false, asset_policy: 'any' });
    const members = await h.call({ path: '/v1/members', subject: 'founder', workspace: res.body.id });
    expect(members.body.data).toEqual([expect.objectContaining({ subject: 'founder', email: 'founder@fresh.io', role: 'owner' })]);
    const audit = await h.call({ path: '/v1/audit-log', subject: 'founder', workspace: res.body.id });
    expect(audit.body.data.map((e: { action: string }) => e.action).sort()).toEqual(['member.added', 'workspace.created']);
  });

  it('refuses a taken slug and leaves no half-created workspace behind', async () => {
    await h.call({ method: 'POST', path: '/v1/workspaces', subject: 'first', body: { slug: 'taken', name: 'T', owner: { email: 'a@t.io' } } });
    const res = await h.call({ method: 'POST', path: '/v1/workspaces', subject: 'second', body: { slug: 'taken', name: 'T2', owner: { email: 'b@t.io' } } });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('already_exists');
    expect((await h.call({ path: '/v1/workspaces', subject: 'second' })).body.data).toEqual([]);
  });

  it('validates settings: the default language must be offered', async () => {
    const res = await h.call({
      method: 'POST',
      path: '/v1/workspaces',
      subject: 'polyglot',
      body: { slug: 'langs', name: 'L', owner: { email: 'p@l.io' }, settings: { default_locale: 'de', locales: ['en'] } },
    });
    expect(res.body.error.code).toBe('validation_failed');
    const ok = await h.call({
      method: 'POST',
      path: '/v1/workspaces',
      subject: 'polyglot',
      body: { slug: 'langs', name: 'L', owner: { email: 'p@l.io' }, settings: { default_locale: 'de', locales: ['de', 'en', 'fr', 'it', 'es'] } },
    });
    expect(ok.status).toBe(201);
    const patch = await h.call({ method: 'PATCH', path: '/v1/workspace', subject: 'polyglot', workspace: ok.body.id, body: { settings: { locales: ['en'] } } });
    expect(patch.body.error.code).toBe('validation_failed');
    // S5: tracking needs a plan that includes it; the free plan does not.
    const free = await h.call({ method: 'PATCH', path: '/v1/workspace', subject: 'polyglot', workspace: ok.body.id, body: { settings: { tracking_enabled: true } } });
    expect(free.status).toBe(429);
    expect(free.body.error).toMatchObject({ code: 'plan_limit_reached', details: { feature: 'tracking', plan: 'free' } });
    await setExemption(h.sql, ok.body.id, true, 'test: a plan with tracking');
    const good = await h.call({ method: 'PATCH', path: '/v1/workspace', subject: 'polyglot', workspace: ok.body.id, body: { settings: { tracking_enabled: true } } });
    expect(good.body.settings).toEqual({ default_locale: 'de', locales: ['de', 'en', 'fr', 'it', 'es'], tracking_enabled: true, asset_policy: 'any' });
  });
});
