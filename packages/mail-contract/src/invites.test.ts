import { describe, expect, it } from 'vitest';
import { Invite, InviteAccept, InviteCreate, InviteCreated, InviteListQuery } from './invites';
import { routes } from './routes';
import { TS } from './test-fixtures';

const invite = {
  id: 'inv_1',
  email: 'ana@example.com',
  role: 'editor',
  status: 'pending',
  invited_by: { member_id: 'mem_1', email: 'owner@example.com' },
  expires_at: TS,
  accepted_at: null,
  revoked_at: null,
  created_at: TS,
};

describe('invites', () => {
  it('reads an invitation, and one whose inviter has left', () => {
    expect(Invite.safeParse(invite).success).toBe(true);
    expect(Invite.safeParse({ ...invite, invited_by: { member_id: null, email: null } }).success).toBe(true);
    expect(Invite.safeParse({ ...invite, status: 'used' }).success).toBe(false);
  });

  it('creates with an address and a role, and a bounded lifetime', () => {
    expect(InviteCreate.safeParse({ email: 'a@b.co', role: 'viewer' }).success).toBe(true);
    expect(InviteCreate.safeParse({ email: 'a@b.co', role: 'viewer', expires_in_days: 30 }).success).toBe(true);
    expect(InviteCreate.safeParse({ email: 'a@b.co', role: 'viewer', expires_in_days: 31 }).success).toBe(false);
    expect(InviteCreate.safeParse({ email: 'nope', role: 'viewer' }).success).toBe(false);
    expect(InviteCreated.safeParse({ invite, token: 'x'.repeat(43) }).success).toBe(true);
  });

  it('accepts with the token and the signed-in address', () => {
    expect(InviteAccept.safeParse({ token: 'x'.repeat(43), email: 'ana@example.com' }).success).toBe(true);
    expect(InviteAccept.safeParse({ token: 'short', email: 'ana@example.com' }).success).toBe(false);
    expect(InviteListQuery.safeParse({ status: 'expired' }).success).toBe(true);
    expect(InviteListQuery.safeParse({ status: 'gone' }).success).toBe(false);
  });

  it('keeps accept for the dashboard and the rest for admins', () => {
    expect(routes['invites.accept'].access).toBe('dashboard');
    expect([routes['invites.create'].access, routes['invites.list'].access, routes['invites.revoke'].access]).toEqual(['admin', 'admin', 'admin']);
  });
});
