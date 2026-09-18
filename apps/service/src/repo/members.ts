import type { Db } from '../db.js';
import type { MemberRole } from '../schemas.js';

export type Member = {
  id: string;
  subject: string;
  email: string;
  name: string | null;
  role: MemberRole;
  created_at: string;
};

const COLUMNS = 'id, subject, email, name, role, created_at';

export function membersRepo(db: Db) {
  return {
    async bySubject(workspaceId: string, subject: string): Promise<Member | null> {
      const rows = await db<Member[]>`
        SELECT ${db.unsafe(COLUMNS)} FROM workspace_members
        WHERE workspace_id = ${workspaceId} AND subject = ${subject}`;
      return rows[0] ?? null;
    },

    async byId(workspaceId: string, memberId: string): Promise<Member | null> {
      const rows = await db<Member[]>`
        SELECT ${db.unsafe(COLUMNS)} FROM workspace_members
        WHERE workspace_id = ${workspaceId} AND id = ${memberId}`;
      return rows[0] ?? null;
    },

    /** Returns null when the subject or the email is already a member. */
    async create(
      workspaceId: string,
      input: { subject: string; email: string; name: string | null; role: MemberRole },
    ): Promise<Member | null> {
      const rows = await db<Member[]>`
        INSERT INTO workspace_members (workspace_id, subject, email, name, role)
        VALUES (${workspaceId}, ${input.subject}, ${input.email.toLowerCase()}, ${input.name}, ${input.role})
        ON CONFLICT DO NOTHING
        RETURNING ${db.unsafe(COLUMNS)}`;
      return rows[0] ?? null;
    },

    async list(workspaceId: string, page: { afterId?: string; limit: number }): Promise<Member[]> {
      return db<Member[]>`
        SELECT ${db.unsafe(COLUMNS)} FROM workspace_members
        WHERE workspace_id = ${workspaceId}
        ${
          page.afterId
            ? db`AND (created_at, id) > (SELECT created_at, id FROM workspace_members WHERE workspace_id = ${workspaceId} AND id = ${page.afterId})`
            : db``
        }
        ORDER BY created_at, id
        LIMIT ${page.limit}`;
    },

    async exists(workspaceId: string, memberId: string): Promise<boolean> {
      const rows = await db`SELECT 1 FROM workspace_members WHERE workspace_id = ${workspaceId} AND id = ${memberId}`;
      return rows.length > 0;
    },

    /**
     * Locks every owner row of the workspace and returns their ids. Called first
     * inside the transaction that demotes or removes an owner, so two owners
     * demoting each other at the same moment serialise and the second one sees
     * that it would leave the workspace without an owner.
     */
    async lockOwners(workspaceId: string): Promise<string[]> {
      const rows = await db<{ id: string }[]>`
        SELECT id FROM workspace_members
        WHERE workspace_id = ${workspaceId} AND role = 'owner'
        ORDER BY id
        FOR UPDATE`;
      return rows.map((r) => r.id);
    },

    async setRole(workspaceId: string, memberId: string, role: MemberRole): Promise<Member | null> {
      const rows = await db<Member[]>`
        UPDATE workspace_members SET role = ${role}, updated_at = now()
        WHERE workspace_id = ${workspaceId} AND id = ${memberId}
        RETURNING ${db.unsafe(COLUMNS)}`;
      return rows[0] ?? null;
    },

    async remove(workspaceId: string, memberId: string): Promise<boolean> {
      const rows = await db`
        DELETE FROM workspace_members WHERE workspace_id = ${workspaceId} AND id = ${memberId} RETURNING id`;
      return rows.length > 0;
    },
  };
}
