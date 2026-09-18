import { routes, type OperationId } from '@marlinjai/mail-contract';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startHarness, type Harness } from '../support/harness.js';

/*
 * Invitations (S3) on the four paths of the stateful-flow standard:
 * forward (invite, accept), backtrack (revoke before accepting), resume and
 * expiry (an expired invitation, then a new one), and re-entry (a second
 * acceptance; leaving and being invited again). Plus the refusals, tenancy and
 * the contract's shapes.
 */

let h: Harness;
let W: Awaited<ReturnType<Harness['seedWorkspace']>>;
let other: Awaited<ReturnType<Harness['seedWorkspace']>>;

beforeAll(async () => {
  h = await startHarness();
  W = await h.seedWorkspace('invites');
  other = await h.seedWorkspace('invites-other');
});
afterAll(() => h?.drop());

const parse = (id: OperationId, body: unknown) => {
  const r = routes[id].response.safeParse(body);
  expect(r.success, JSON.stringify(r.success ? null : r.error.issues)).toBe(true);
};

async function invite(email: string, role = 'editor', as = W.owner, ws = W.id) {
  const res = await h.call({ method: 'POST', path: '/v1/invites', subject: as, workspace: ws, body: { email, role } });
  return res;
}

async function accept(token: string, subject: string, email: string, name: string | null = null) {
  return h.call({ method: 'POST', path: '/v1/invites/accept', subject, body: { token, email, name } });
}

async function audit(action: string) {
  const res = await h.call({ path: `/v1/audit-log?action=${action}`, subject: W.owner, workspace: W.id });
  return res.body.data as Array<{ action: string; target_id: string; details: Record<string, unknown> }>;
}

describe('invitations: forward', () => {
  it('invites an address, shows the token once, and the invited person joins with the role', async () => {
    const res = await invite('Ana@Example.com', 'editor');
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    parse('invites.create', res.body);
    expect(res.body.token).toMatch(/^inv_/);
    expect(res.body.invite).toMatchObject({ email: 'ana@example.com', role: 'editor', status: 'pending', accepted_at: null, revoked_at: null });
    expect(res.body.invite.invited_by.email).toBe(`${W.owner}@example.com`);

    // The token is never stored or listed.
    const [row] = await h.sql`SELECT token_hash FROM workspace_invites WHERE id = ${res.body.invite.id}`;
    expect(row!.token_hash).not.toContain(res.body.token);
    const list = await h.call({ path: '/v1/invites', subject: W.owner, workspace: W.id });
    parse('invites.list', list.body);
    expect(JSON.stringify(list.body)).not.toContain(res.body.token);

    const accepted = await accept(res.body.token, 'sub-ana', 'ana@example.com', 'Ana');
    expect(accepted.status, JSON.stringify(accepted.body)).toBe(200);
    parse('invites.accept', accepted.body);
    expect(accepted.body).toMatchObject({ already_member: false, workspace: { id: W.id, role: 'editor' } });

    const members = await h.call({ path: '/v1/members', subject: W.owner, workspace: W.id });
    expect(members.body.data).toEqual(expect.arrayContaining([expect.objectContaining({ subject: 'sub-ana', email: 'ana@example.com', name: 'Ana', role: 'editor' })]));
    const after = await h.call({ path: `/v1/invites?status=accepted`, subject: W.owner, workspace: W.id });
    expect(after.body.data.map((i: { id: string }) => i.id)).toContain(res.body.invite.id);

    expect((await audit('member.invited')).some((e) => e.target_id === res.body.invite.id)).toBe(true);
    expect((await audit('member.added')).some((e) => e.details.via === 'invite' && e.details.invite_id === res.body.invite.id)).toBe(true);
  });

  it('accepts only the invited address, case-insensitively', async () => {
    const res = await invite('ben@example.com');
    const wrong = await accept(res.body.token, 'sub-ben', 'someone@example.com');
    expect(wrong.status).toBe(403);
    expect(wrong.body.error).toMatchObject({ code: 'forbidden', details: { reason: 'email_mismatch' } });
    const ok = await accept(res.body.token, 'sub-ben', 'BEN@example.com');
    expect(ok.status).toBe(200);
  });

  it('refuses a token nobody issued', async () => {
    const res = await accept(`inv_${'x'.repeat(43)}`, 'sub-x', 'x@example.com');
    expect(res.status).toBe(404);
  });
});

describe('invitations: backtrack', () => {
  it('a revoked invitation cannot be accepted, and revoking is audited', async () => {
    const res = await invite('cara@example.com');
    const revoked = await h.call({ method: 'DELETE', path: `/v1/invites/${res.body.invite.id}`, subject: W.owner, workspace: W.id });
    expect(revoked.status).toBe(200);
    parse('invites.revoke', revoked.body);
    expect(revoked.body.status).toBe('revoked');
    const tried = await accept(res.body.token, 'sub-cara', 'cara@example.com');
    expect(tried.status).toBe(409);
    expect(tried.body.error.details).toEqual({ reason: 'revoked' });
    expect((await audit('invite.revoked')).some((e) => e.target_id === res.body.invite.id)).toBe(true);
    // Revoking again is harmless; a new invitation for the address is possible now.
    expect((await h.call({ method: 'DELETE', path: `/v1/invites/${res.body.invite.id}`, subject: W.owner, workspace: W.id })).status).toBe(200);
    expect((await invite('cara@example.com')).status).toBe(201);
  });

  it('one pending invitation per address, and none for a member', async () => {
    expect((await invite('dora@example.com')).status).toBe(201);
    const twice = await invite('dora@example.com');
    expect(twice.status).toBe(409);
    expect(twice.body.error.code).toBe('already_exists');
    const member = await invite(`${W.owner}@example.com`);
    expect(member.body.error.code).toBe('already_exists');
  });

  it('an inviter who lost the right to grant the role cannot bring anyone in', async () => {
    // An admin invites, then is demoted before the invitation is accepted.
    const admin = await h.call({ method: 'POST', path: '/v1/members', subject: W.owner, workspace: W.id, body: { subject: 'sub-admin', email: 'admin@example.com', role: 'admin' } });
    const res = await invite('eve@example.com', 'editor', 'sub-admin');
    expect(res.status).toBe(201);
    await h.call({ method: 'PATCH', path: `/v1/members/${admin.body.id}`, subject: W.owner, workspace: W.id, body: { role: 'viewer' } });
    const tried = await accept(res.body.token, 'sub-eve', 'eve@example.com');
    expect(tried.status).toBe(403);
    expect(tried.body.error.details).toEqual({ reason: 'inviter_lacks_role' });
  });

  it('only an owner invites an owner, and an API key cannot invite at all', async () => {
    await h.call({ method: 'POST', path: '/v1/members', subject: W.owner, workspace: W.id, body: { subject: 'sub-admin2', email: 'admin2@example.com', role: 'admin' } });
    const byAdmin = await invite('future-owner@example.com', 'owner', 'sub-admin2');
    expect(byAdmin.status).toBe(403);
    expect((await invite('future-owner@example.com', 'owner')).status).toBe(201);
    const byKey = await h.call({ method: 'POST', path: '/v1/invites', key: W.key, body: { email: 'k@example.com', role: 'viewer' } });
    expect(byKey.status).toBe(403);
  });
});

describe('invitations: expiry and a new invitation', () => {
  it('an expired invitation is refused and listed as expired; a new one works', async () => {
    const res = await invite('finn@example.com');
    await h.sql`UPDATE workspace_invites SET created_at = now() - interval '9 days', expires_at = now() - interval '1 second' WHERE id = ${res.body.invite.id}`;
    const tried = await accept(res.body.token, 'sub-finn', 'finn@example.com');
    expect(tried.status).toBe(409);
    expect(tried.body.error.details).toEqual({ reason: 'expired' });
    const expired = await h.call({ path: '/v1/invites?status=expired', subject: W.owner, workspace: W.id });
    expect(expired.body.data.map((i: { id: string }) => i.id)).toContain(res.body.invite.id);

    const again = await invite('finn@example.com');
    expect(again.status).toBe(201);
    expect((await accept(again.body.token, 'sub-finn', 'finn@example.com')).status).toBe(200);
  });
});

describe('invitations: re-entry', () => {
  it('a second acceptance by the member is a no-op success; by anyone else it is refused', async () => {
    const res = await invite('gia@example.com');
    expect((await accept(res.body.token, 'sub-gia', 'gia@example.com')).body.already_member).toBe(false);
    const again = await accept(res.body.token, 'sub-gia', 'gia@example.com');
    expect(again.status).toBe(200);
    expect(again.body.already_member).toBe(true);
    const members = await h.sql`SELECT count(*)::int AS n FROM workspace_members WHERE workspace_id = ${W.id} AND subject = 'sub-gia'`;
    expect(members[0]!.n).toBe(1);
  });

  it('after leaving, the old link is used up, and a new invitation brings the person back', async () => {
    const first = await invite('hal@example.com', 'viewer');
    const joined = await accept(first.body.token, 'sub-hal', 'hal@example.com');
    expect(joined.status).toBe(200);
    const me = (await h.call({ path: '/v1/members', subject: 'sub-hal', workspace: W.id })).body.data.find((m: { subject: string }) => m.subject === 'sub-hal');
    expect((await h.call({ method: 'DELETE', path: `/v1/members/${me.id}`, subject: 'sub-hal', workspace: W.id })).status).toBe(200);

    const stale = await accept(first.body.token, 'sub-hal', 'hal@example.com');
    expect(stale.status).toBe(409);
    expect(stale.body.error.details).toEqual({ reason: 'accepted' });

    const second = await invite('hal@example.com', 'editor');
    const back = await accept(second.body.token, 'sub-hal', 'hal@example.com');
    expect(back.status).toBe(200);
    expect(back.body.workspace.role).toBe('editor');
  });

  it('accepting while already a member (invited again by mistake) uses the invitation up and changes nothing', async () => {
    const res = await h.call({ method: 'POST', path: '/v1/invites', subject: W.owner, workspace: W.id, body: { email: 'ivy@example.com', role: 'viewer' } });
    // Ivy joins through another path meanwhile.
    await h.call({ method: 'POST', path: '/v1/members', subject: W.owner, workspace: W.id, body: { subject: 'sub-ivy', email: 'ivy@example.com', role: 'editor' } });
    const accepted = await accept(res.body.token, 'sub-ivy', 'ivy@example.com');
    expect(accepted.status).toBe(200);
    expect(accepted.body).toMatchObject({ already_member: true, workspace: { role: 'editor' } });
    const listed = await h.call({ path: '/v1/invites?status=accepted', subject: W.owner, workspace: W.id });
    expect(listed.body.data.map((i: { id: string }) => i.id)).toContain(res.body.invite.id);
  });
});

describe('invitations: tenancy', () => {
  it('another workspace neither lists nor revokes these invitations', async () => {
    const res = await invite('jo@example.com');
    const theirs = await h.call({ path: '/v1/invites', subject: other.owner, workspace: other.id });
    expect(theirs.body.data).toEqual([]);
    const revoke = await h.call({ method: 'DELETE', path: `/v1/invites/${res.body.invite.id}`, subject: other.owner, workspace: other.id });
    expect(revoke.status).toBe(404);
  });

  it('an editor can neither list nor create invitations', async () => {
    await h.call({ method: 'POST', path: '/v1/members', subject: W.owner, workspace: W.id, body: { subject: 'sub-ed', email: 'ed@example.com', role: 'editor' } });
    expect((await h.call({ path: '/v1/invites', subject: 'sub-ed', workspace: W.id })).status).toBe(403);
    expect((await invite('k2@example.com', 'viewer', 'sub-ed')).status).toBe(403);
  });
});
