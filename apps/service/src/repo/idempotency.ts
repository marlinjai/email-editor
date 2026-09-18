import type { Db } from '../db.js';

export type IdempotencyRecord = {
  request_hash: string;
  state: 'in_progress' | 'completed';
  response_status: number | null;
  response_body: string | null;
};

/** How long a key is remembered. Matches IDEMPOTENCY_KEY_RETENTION_HOURS in the contract. */
export const RETENTION_HOURS = 24;

/**
 * A claim still `in_progress` after this long belongs to a request that died
 * with its process (a crash or a deploy mid-request). It is cleared, so the
 * client's retry with the same key runs instead of being refused for a day.
 */
export const STALE_CLAIM_MINUTES = 5;

/**
 * The idempotency ledger. A scope is "ws:<workspace id>" for every call bound to
 * a workspace, and "subject:<auth-brain subject>" for creating a workspace, the
 * one mutating call that has no workspace yet. The workspace id, when there is
 * one, is always the first argument.
 */
export function idempotencyRepo(db: Db) {
  return {
    /**
     * Claims the key for this request. Insert-first on the unique (scope, key), so
     * two concurrent requests with one key cannot both run: exactly one gets
     * `claimed`, the other reads the row the first one wrote. An expired entry, or a stale claim, is
     * cleared in the same statement sequence before the claim.
     */
    async claim(
      workspaceId: string | null,
      scope: string,
      key: string,
      requestHash: string,
    ): Promise<{ claimed: true } | { claimed: false; record: IdempotencyRecord }> {
      await db`
        DELETE FROM idempotency_keys
        WHERE scope = ${scope} AND key = ${key}
          AND (created_at < now() - make_interval(hours => ${RETENTION_HOURS})
               OR (state = 'in_progress' AND created_at < now() - make_interval(mins => ${STALE_CLAIM_MINUTES})))`;
      const inserted = await db`
        INSERT INTO idempotency_keys (scope, workspace_id, key, request_hash)
        VALUES (${scope}, ${workspaceId}, ${key}, ${requestHash})
        ON CONFLICT (scope, key) DO NOTHING
        RETURNING id`;
      if (inserted.length > 0) return { claimed: true };
      const rows = await db<IdempotencyRecord[]>`
        SELECT request_hash, state, response_status, response_body
        FROM idempotency_keys WHERE scope = ${scope} AND key = ${key}`;
      if (!rows[0]) {
        // The holder released it between our insert and our read: claim again.
        return this.claim(workspaceId, scope, key, requestHash);
      }
      return { claimed: false, record: rows[0] };
    },

    async complete(scope: string, key: string, status: number, body: string): Promise<void> {
      await db`
        UPDATE idempotency_keys
        SET state = 'completed', response_status = ${status}, response_body = ${body}, completed_at = now()
        WHERE scope = ${scope} AND key = ${key}`;
    },

    /** Releases a claim whose request failed on the server's side, so the client can retry with the same key. */
    async release(scope: string, key: string): Promise<void> {
      await db`DELETE FROM idempotency_keys WHERE scope = ${scope} AND key = ${key} AND state = 'in_progress'`;
    },

    /** Housekeeping: drops entries past retention. Returns how many went. */
    async purgeExpired(): Promise<number> {
      const rows = await db`
        DELETE FROM idempotency_keys
        WHERE created_at < now() - make_interval(hours => ${RETENTION_HOURS}) RETURNING id`;
      return rows.length;
    },
  };
}
