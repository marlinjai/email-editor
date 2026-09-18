import type { Db } from '../db.js';

/** The ledger behind the rolling 24-hour recipient budget (see src/budget.ts). */
export function providerSendsRepo(db: Db) {
  return {
    async record(workspaceId: string, providerId: string, recipients: number): Promise<{ id: string; created_at: string }> {
      const rows = await db<{ id: string; created_at: string }[]>`
        INSERT INTO provider_sends (workspace_id, provider_id, recipients)
        VALUES (${workspaceId}, ${providerId}, ${recipients})
        RETURNING id, created_at`;
      return rows[0]!;
    },

    async remove(workspaceId: string, entryId: string): Promise<boolean> {
      const rows = await db`DELETE FROM provider_sends WHERE workspace_id = ${workspaceId} AND id = ${entryId} RETURNING id`;
      return rows.length > 0;
    },

    /** Entries in the last 24 hours, oldest first. */
    async window(workspaceId: string, providerId: string): Promise<Array<{ recipients: number; created_at: string }>> {
      return db<Array<{ recipients: number; created_at: string }>>`
        SELECT recipients, created_at FROM provider_sends
        WHERE workspace_id = ${workspaceId} AND provider_id = ${providerId} AND created_at > now() - interval '24 hours'
        ORDER BY created_at, id`;
    },

    /** When the provider last handed over a message, for `min_interval_ms`. */
    async lastSentAt(workspaceId: string, providerId: string): Promise<string | null> {
      const rows = await db<{ at: string | null }[]>`
        SELECT max(created_at) AS at FROM provider_sends WHERE workspace_id = ${workspaceId} AND provider_id = ${providerId}`;
      return rows[0]?.at ?? null;
    },
  };
}
