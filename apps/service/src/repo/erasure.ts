import type { Db } from '../db.js';

/**
 * Company erasure (auth-brain's `tenant.erased`). The one repository that works
 * across workspaces on purpose: it answers "which workspaces belong to this
 * company" for a caller that holds no workspace, and removes a whole workspace
 * with everything in it. Only `src/routes/erasure.ts` uses it, behind the
 * signature check.
 */
export function erasureRepo(db: Db) {
  return {
    /** Whether this event id was already handled (a redelivery is a no-op). */
    async eventHandled(eventId: string): Promise<boolean> {
      const rows = await db`SELECT 1 FROM erasure_events WHERE event_id = ${eventId}`;
      return rows.length > 0;
    },

    async recordEvent(input: { eventId: string; kind: string; tenantId: string | null; workspacesErased: number }): Promise<void> {
      await db`
        INSERT INTO erasure_events (event_id, kind, tenant_id, workspaces_erased)
        VALUES (${input.eventId}, ${input.kind}, ${input.tenantId}, ${input.workspacesErased})
        ON CONFLICT (event_id) DO NOTHING`;
    },

    /** Every workspace created for the company, locked so no second erasure races this one. */
    async workspaceIdsForCompany(companyId: string): Promise<string[]> {
      const rows = await db<{ id: string }[]>`
        SELECT id FROM workspaces WHERE company_id = ${companyId} ORDER BY id FOR UPDATE`;
      return rows.map((r) => r.id);
    },

    /** The Storage Brain files of a workspace's uploaded images, to delete before the rows go. */
    async storageFileIds(workspaceId: string): Promise<string[]> {
      const rows = await db<{ storage_file_id: string }[]>`
        SELECT storage_file_id FROM assets WHERE workspace_id = ${workspaceId}`;
      return rows.map((r) => r.storage_file_id);
    },

    /**
     * Deletes a workspace and every row it owns. The tables that point at a
     * provider or a topic with ON DELETE RESTRICT (mailings, messages, the
     * recipient rows between them) go first, explicitly, because a cascade
     * from the workspace reaches sibling tables in no guaranteed order; the
     * rest cascade from the workspace row.
     */
    async eraseWorkspace(workspaceId: string): Promise<void> {
      await db`DELETE FROM mailing_recipients WHERE workspace_id = ${workspaceId}`;
      await db`DELETE FROM messages WHERE workspace_id = ${workspaceId}`;
      await db`DELETE FROM mailings WHERE workspace_id = ${workspaceId}`;
      await db`DELETE FROM workspaces WHERE id = ${workspaceId}`;
    },
  };
}
