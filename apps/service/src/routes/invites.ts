import { createHash, randomBytes } from 'node:crypto';
import { DEFAULT_INVITE_TTL_DAYS, type MemberRole } from '@marlinjai/mail-contract';
import { Hono } from 'hono';
import { ApiError } from '../api-error.js';
import { roleAtLeast } from '../auth.js';
import { assertWithinLimit } from '../billing/usage.js';
import { actorOf, type AppEnv } from '../context.js';
import type { Sql } from '../db.js';
import { mount, type MountDeps } from '../mount.js';
import { repos } from '../repo/index.js';
import { toInvite } from '../repo/invites.js';
import { body, pageArgs, params, query, rowId, toPage } from '../validate.js';

/**
 * Invitations (S3): how a person who is not a member yet joins a workspace.
 *
 * - `invites.create` (admin, a person signed in: the acceptance re-checks the
 *   inviter, so an invitation needs one) answers with a token shown once; only
 *   its SHA-256 is stored.
 * - `invites.accept` (dashboard, no workspace yet) needs the signed-in address
 *   to match, the invitation to be pending, and the inviter to still be a
 *   member able to grant the role. Single use. Accepting while already a member
 *   uses it up and succeeds without changing anything.
 * - `invites.revoke` ends a pending invitation.
 *
 * Audit: `member.invited`, `invite.revoked`, and `member.added` on acceptance.
 */

export const INVITE_TOKEN_PREFIX = 'inv_';

function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

function subjectOf(c: { get(key: 'caller'): AppEnv['Variables']['caller'] }): string {
  const caller = c.get('caller');
  if (caller.kind !== 'dashboard') throw new ApiError('forbidden', 'Only a signed-in person can accept an invitation.');
  return caller.subject;
}

/** Whether a member with `role` may bring someone in as `granted`. */
function mayGrant(role: MemberRole, granted: MemberRole): boolean {
  return granted === 'owner' ? role === 'owner' : roleAtLeast(role, 'admin');
}

export function inviteRoutes(sql: Sql, deps: MountDeps) {
  const app = new Hono<AppEnv>();
  const { pool } = deps;

  mount(app, 'invites.create', deps, async (c) => {
    const access = c.get('access');
    const input = await body(c, 'invites.create');
    if (access.via !== 'member') {
      throw new ApiError('forbidden', 'Invitations are made by a person signed in through the dashboard, not by an API key.');
    }
    if (!mayGrant(access.role, input.role)) {
      throw new ApiError('insufficient_role', 'Only an owner can invite another owner.', { required: 'owner', actual: access.role });
    }
    const email = input.email.trim().toLowerCase();
    const token = `${INVITE_TOKEN_PREFIX}${randomBytes(32).toString('base64url')}`;
    const invite = await sql.begin(async (tx) => {
      const r = repos(tx);
      // One invitation at a time per address: the workspace row is the lock, so
      // two admins inviting the same address at once cannot both succeed.
      await tx`SELECT 1 FROM workspaces WHERE id = ${access.workspaceId} FOR UPDATE`;
      const members = await tx`SELECT 1 FROM workspace_members WHERE workspace_id = ${access.workspaceId} AND email = ${email}`;
      if (members.length > 0) throw new ApiError('already_exists', `${email} is already a member of this workspace.`);
      if ((await r.invites.pendingFor(access.workspaceId, email)).length > 0) {
        throw new ApiError('already_exists', `${email} already has a pending invitation. Revoke it to send a new one.`);
      }
      const created = await r.invites.create(access.workspaceId, {
        tokenHash: hashToken(token),
        email,
        role: input.role,
        invitedByMemberId: access.member.id,
        invitedByEmail: access.member.email,
        ttlDays: input.expires_in_days ?? DEFAULT_INVITE_TTL_DAYS,
      });
      await r.audit.record(access.workspaceId, {
        action: 'member.invited',
        actor: actorOf(access),
        targetType: 'invite',
        targetId: created.id,
        details: { role: created.role, expires_at: created.expires_at },
      });
      return created;
    });
    return c.json({ invite: toInvite(invite), token }, 201);
  });

  mount(app, 'invites.list', deps, async (c) => {
    const { workspaceId } = c.get('access');
    const q = query(c, 'invites.list');
    const page = await pageArgs(q, (id) => pool.invites.exists(workspaceId, id));
    const rows = await pool.invites.list(workspaceId, { afterId: page.afterId, limit: page.limit + 1, status: q.status });
    const { data, next_cursor } = toPage(rows, page.limit);
    return c.json({ data: data.map(toInvite), next_cursor });
  });

  mount(app, 'invites.revoke', deps, async (c) => {
    const access = c.get('access');
    const id = rowId(params(c, 'invites.revoke').id, 'invite');
    const invite = await sql.begin(async (tx) => {
      const r = repos(tx);
      const current = await r.invites.byId(access.workspaceId, id, true);
      if (!current) throw new ApiError('not_found', 'No such invitation in this workspace.');
      if (current.status === 'accepted') throw new ApiError('conflict', 'This invitation was already accepted; remove the member instead.', { reason: 'accepted' });
      if (current.status === 'revoked') return current;
      const revoked = (await r.invites.revoke(access.workspaceId, id))!;
      await r.audit.record(access.workspaceId, {
        action: 'invite.revoked',
        actor: actorOf(access),
        targetType: 'invite',
        targetId: id,
        details: { role: current.role, was: current.status },
      });
      return revoked;
    });
    return c.json(toInvite(invite));
  });

  mount(app, 'invites.accept', deps, async (c) => {
    const subject = subjectOf(c);
    const input = await body(c, 'invites.accept');
    const email = input.email.trim().toLowerCase();
    const result = await sql.begin(async (tx) => {
      const r = repos(tx);
      const invite = await r.invites.byTokenHashForAccept(hashToken(input.token));
      if (!invite) throw new ApiError('not_found', 'This invitation link is not valid.');
      const ws = invite.workspace_id;
      if (invite.email !== email) {
        throw new ApiError('forbidden', 'This invitation is for another address. Sign in with the invited address.', { reason: 'email_mismatch' });
      }
      const existing = await r.members.bySubject(ws, subject);
      if (invite.status === 'revoked') throw new ApiError('conflict', 'This invitation was revoked.', { reason: 'revoked' });
      if (invite.status === 'accepted') {
        // A second acceptance by the person who is already in: harmless.
        if (existing) return { ws, member: existing, alreadyMember: true };
        throw new ApiError('conflict', 'This invitation was already used. Ask for a new one.', { reason: 'accepted' });
      }
      if (invite.status === 'expired') throw new ApiError('conflict', 'This invitation has expired. Ask for a new one.', { reason: 'expired' });
      if (existing) {
        await r.invites.markAccepted(ws, invite.id, existing.id);
        return { ws, member: existing, alreadyMember: true };
      }
      const inviter = invite.invited_by_member_id ? await r.members.byId(ws, invite.invited_by_member_id) : null;
      if (!inviter || !mayGrant(inviter.role, invite.role)) {
        throw new ApiError('forbidden', 'The person who invited you can no longer add members with this role. Ask for a new invitation.', {
          reason: 'inviter_lacks_role',
        });
      }
      const member = await r.members.create(ws, { subject, email, name: input.name ?? null, role: invite.role });
      if (!member) throw new ApiError('already_exists', 'Another member of this workspace already uses this address.');
      await assertWithinLimit(tx, ws, 'members');
      await r.invites.markAccepted(ws, invite.id, member.id);
      await r.audit.record(ws, {
        action: 'member.added',
        actor: { type: 'member', member_id: member.id, subject: member.subject },
        targetType: 'member',
        targetId: member.id,
        details: { subject: member.subject, role: member.role, via: 'invite', invite_id: invite.id, invited_by: inviter.id },
      });
      return { ws, member, alreadyMember: false };
    });
    const workspace = await pool.workspaces.get(result.ws);
    if (!workspace) throw new ApiError('not_found', 'The workspace no longer exists.');
    return c.json({ workspace: { ...workspace, role: result.member.role }, already_member: result.alreadyMember });
  });

  return app;
}
