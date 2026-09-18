import type { Invite, InviteStatus, MemberRole } from '@marlinjai/mail-contract';
import type { Db } from '../db.js';

/** An invitation row, with its status derived at read time. */
export type InviteRow = {
  id: string;
  workspace_id: string;
  email: string;
  role: MemberRole;
  status: InviteStatus;
  invited_by_member_id: string | null;
  invited_by_email: string | null;
  expires_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
  created_at: string;
};

const STATUS = `CASE
  WHEN revoked_at IS NOT NULL THEN 'revoked'
  WHEN accepted_at IS NOT NULL THEN 'accepted'
  WHEN expires_at <= now() THEN 'expired'
  ELSE 'pending' END`;

const COLUMNS = `id, workspace_id, email, role, ${STATUS} AS status, invited_by_member_id, invited_by_email,
  expires_at, accepted_at, revoked_at, created_at`;

export function toInvite(row: InviteRow): Invite {
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    status: row.status,
    invited_by: { member_id: row.invited_by_member_id, email: row.invited_by_email },
    expires_at: row.expires_at,
    accepted_at: row.accepted_at,
    revoked_at: row.revoked_at,
    created_at: row.created_at,
  };
}

export function invitesRepo(db: Db) {
  return {
    async create(
      workspaceId: string,
      input: { tokenHash: string; email: string; role: MemberRole; invitedByMemberId: string; invitedByEmail: string; ttlDays: number },
    ): Promise<InviteRow> {
      const rows = await db<InviteRow[]>`
        INSERT INTO workspace_invites (workspace_id, token_hash, email, role, invited_by_member_id, invited_by_email, expires_at)
        VALUES (${workspaceId}, ${input.tokenHash}, ${input.email.toLowerCase()}, ${input.role}, ${input.invitedByMemberId},
                ${input.invitedByEmail}, now() + make_interval(days => ${input.ttlDays}))
        RETURNING ${db.unsafe(COLUMNS)}`;
      return rows[0]!;
    },

    /** Pending (unexpired, unrevoked, unaccepted) invitations for one address. */
    async pendingFor(workspaceId: string, email: string): Promise<InviteRow[]> {
      return db<InviteRow[]>`
        SELECT ${db.unsafe(COLUMNS)} FROM workspace_invites
        WHERE workspace_id = ${workspaceId} AND email = ${email.toLowerCase()}
          AND revoked_at IS NULL AND accepted_at IS NULL AND expires_at > now()`;
    },

    async byId(workspaceId: string, inviteId: string, lock = false): Promise<InviteRow | null> {
      const rows = await db<InviteRow[]>`
        SELECT ${db.unsafe(COLUMNS)} FROM workspace_invites
        WHERE workspace_id = ${workspaceId} AND id = ${inviteId}
        ${lock ? db`FOR UPDATE` : db``}`;
      return rows[0] ?? null;
    },

    async exists(workspaceId: string, inviteId: string): Promise<boolean> {
      const rows = await db`SELECT 1 FROM workspace_invites WHERE workspace_id = ${workspaceId} AND id = ${inviteId}`;
      return rows.length > 0;
    },

    async list(workspaceId: string, page: { afterId?: string; limit: number; status?: InviteStatus }): Promise<InviteRow[]> {
      return db<InviteRow[]>`
        SELECT * FROM (SELECT ${db.unsafe(COLUMNS)} FROM workspace_invites WHERE workspace_id = ${workspaceId}) i
        WHERE true
        ${page.status ? db`AND i.status = ${page.status}` : db``}
        ${
          page.afterId
            ? db`AND (i.created_at, i.id) < (SELECT created_at, id FROM workspace_invites WHERE workspace_id = ${workspaceId} AND id = ${page.afterId})`
            : db``
        }
        ORDER BY i.created_at DESC, i.id DESC
        LIMIT ${page.limit}`;
    },

    async revoke(workspaceId: string, inviteId: string): Promise<InviteRow | null> {
      const rows = await db<InviteRow[]>`
        UPDATE workspace_invites SET revoked_at = now()
        WHERE workspace_id = ${workspaceId} AND id = ${inviteId} AND revoked_at IS NULL AND accepted_at IS NULL
        RETURNING ${db.unsafe(COLUMNS)}`;
      return rows[0] ?? null;
    },

    /**
     * The invitation a token names, locked, for accepting it. Unscoped by
     * design: the token is what identifies the workspace, for a person who is
     * not a member of it yet. Returns only what the scoped calls that follow need.
     */
    async byTokenHashForAccept(tokenHash: string): Promise<InviteRow | null> {
      const rows = await db<InviteRow[]>`
        SELECT ${db.unsafe(COLUMNS)} FROM workspace_invites WHERE token_hash = ${tokenHash} FOR UPDATE`;
      return rows[0] ?? null;
    },

    async markAccepted(workspaceId: string, inviteId: string, memberId: string | null): Promise<void> {
      await db`
        UPDATE workspace_invites SET accepted_at = now(), accepted_member_id = ${memberId}
        WHERE workspace_id = ${workspaceId} AND id = ${inviteId} AND accepted_at IS NULL AND revoked_at IS NULL`;
    },
  };
}
