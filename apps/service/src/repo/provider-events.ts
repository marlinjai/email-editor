import type { Db } from '../db.js';

/** `unmatched`: an event over an hour old naming an email this provider never sent; counted, never acted on. */
export type ProviderEventOutcome = 'suppressed' | 'already_suppressed' | 'ignored' | 'unmatched';

/** How long a provider event's id is remembered: well past Resend's last retry (about 33 hours). */
const RETENTION = '30 days';

export function providerEventsRepo(db: Db) {
  return {
    /**
     * Claims an inbound provider event by its id. Returns false when it was
     * already claimed (a retry or a replay), in which case nothing may change.
     * A concurrent duplicate waits here until the first commits, then gets false.
     */
    async claim(
      workspaceId: string,
      input: { providerId: string; externalId: string; type: string; providerMessageId: string | null },
    ): Promise<boolean> {
      const rows = await db`
        INSERT INTO provider_events (workspace_id, provider_id, external_id, type, provider_message_id, outcome)
        VALUES (${workspaceId}, ${input.providerId}, ${input.externalId}, ${input.type}, ${input.providerMessageId}, 'ignored')
        ON CONFLICT (provider_id, external_id) DO NOTHING
        RETURNING id`;
      return rows.length > 0;
    },

    async setOutcome(workspaceId: string, providerId: string, externalId: string, outcome: ProviderEventOutcome): Promise<void> {
      await db`
        UPDATE provider_events SET outcome = ${outcome}
        WHERE workspace_id = ${workspaceId} AND provider_id = ${providerId} AND external_id = ${externalId}`;
    },

    async outcomeOf(providerId: string, externalId: string): Promise<ProviderEventOutcome | null> {
      const rows = await db<{ outcome: ProviderEventOutcome }[]>`
        SELECT outcome FROM provider_events WHERE provider_id = ${providerId} AND external_id = ${externalId}`;
      return rows[0]?.outcome ?? null;
    },

    /** Forgets this provider's event ids older than the retention. */
    async prune(providerId: string): Promise<number> {
      const rows = await db`
        DELETE FROM provider_events WHERE provider_id = ${providerId} AND received_at < now() - ${RETENTION}::interval RETURNING id`;
      return rows.length;
    },
  };
}
