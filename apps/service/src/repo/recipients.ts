import type { RecipientStatus, SkipReason } from '@marlinjai/mail-contract';
import type { Db } from '../db.js';
import { asJson } from './json.js';

export type RecipientRow = {
  id: string;
  mailing_id: string;
  contact_id: string | null;
  email: string;
  merge: Record<string, unknown>;
  status: RecipientStatus;
  skip_reason: SkipReason | null;
  attempts: number;
  next_attempt_at: string;
  claimed_at: string | null;
  message_id: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
};

const COLUMNS = `id, mailing_id, contact_id, email, merge, status, skip_reason, attempts, next_attempt_at, claimed_at,
  message_id, last_error, created_at, updated_at`;

export function recipientsRepo(db: Db) {
  return {
    /**
     * Queues recipients. Idempotent on the address within the mailing: an address
     * already on it is left unchanged and reported in `alreadyPresent`.
     */
    async addMany(
      workspaceId: string,
      mailingId: string,
      items: ReadonlyArray<{ email: string; contactId: string | null; merge: Record<string, unknown> }>,
    ): Promise<{ added: string[]; alreadyPresent: string[] }> {
      if (items.length === 0) return { added: [], alreadyPresent: [] };
      const emails = items.map((i) => i.email.toLowerCase());
      const rows = await db<{ email: string }[]>`
        INSERT INTO mailing_recipients (workspace_id, mailing_id, email, contact_id, merge)
        SELECT ${workspaceId}, ${mailingId}, x.email, x.contact_id, x.merge
        FROM jsonb_to_recordset(${asJson(
          db,
          items.map((i, n) => ({ email: emails[n], contact_id: i.contactId, merge: i.merge })),
        )}::jsonb) AS x(email text, contact_id uuid, merge jsonb)
        ON CONFLICT (mailing_id, email) DO NOTHING
        RETURNING email`;
      const added = new Set(rows.map((r) => r.email));
      return { added: [...added], alreadyPresent: emails.filter((e) => !added.has(e)) };
    },

    async get(workspaceId: string, recipientId: string): Promise<RecipientRow | null> {
      const rows = await db<RecipientRow[]>`
        SELECT ${db.unsafe(COLUMNS)} FROM mailing_recipients WHERE workspace_id = ${workspaceId} AND id = ${recipientId}`;
      return rows[0] ?? null;
    },

    async list(
      workspaceId: string,
      mailingId: string,
      query: { afterId?: string; limit: number; status?: RecipientStatus; skipReason?: SkipReason },
    ): Promise<RecipientRow[]> {
      return db<RecipientRow[]>`
        SELECT ${db.unsafe(COLUMNS)} FROM mailing_recipients
        WHERE workspace_id = ${workspaceId} AND mailing_id = ${mailingId}
        ${query.status ? db`AND status = ${query.status}` : db``}
        ${query.skipReason ? db`AND skip_reason = ${query.skipReason}` : db``}
        ${
          query.afterId
            ? db`AND (created_at, id) > (SELECT created_at, id FROM mailing_recipients
                 WHERE workspace_id = ${workspaceId} AND mailing_id = ${mailingId} AND id = ${query.afterId})`
            : db``
        }
        ORDER BY created_at, id
        LIMIT ${query.limit}`;
    },

    /**
     * Claims the next due queued recipient of a mailing and marks it `sending`,
     * with `FOR UPDATE SKIP LOCKED` so concurrent workers never claim the same
     * row. Returns null when nothing is due. Run inside a transaction that also
     * checks suppression and subscription; commit before handing the message to
     * the provider, so a crash mid-send leaves a visible `sending` row.
     */
    async claimNext(workspaceId: string, mailingId: string): Promise<RecipientRow | null> {
      const rows = await db<RecipientRow[]>`
        UPDATE mailing_recipients SET status = 'sending', claimed_at = now(), attempts = attempts + 1, updated_at = now()
        WHERE id = (
          SELECT id FROM mailing_recipients
          WHERE workspace_id = ${workspaceId} AND mailing_id = ${mailingId} AND status = 'queued' AND next_attempt_at <= now()
          ORDER BY next_attempt_at, created_at, id
          LIMIT 1
          FOR UPDATE SKIP LOCKED)
        RETURNING ${db.unsafe(COLUMNS)}`;
      return rows[0] ?? null;
    },

    /** Records a recipient's outcome. `from` guards against a concurrent change (compare-and-set). */
    async settle(
      workspaceId: string,
      recipientId: string,
      from: readonly RecipientStatus[],
      to:
        | { status: 'sent'; messageId: string }
        | { status: 'failed'; messageId: string | null; error: string }
        | { status: 'skipped'; reason: SkipReason; error?: string }
        /** Back to the queue, due `retryInMs` from now on the database's clock (the clock the claim compares with). */
        | { status: 'queued'; retryInMs: number; error: string },
    ): Promise<RecipientRow | null> {
      const rows = await db<RecipientRow[]>`
        UPDATE mailing_recipients SET
          status = ${to.status},
          skip_reason = ${to.status === 'skipped' ? to.reason : null},
          message_id = ${'messageId' in to ? to.messageId : db`message_id`},
          last_error = ${'error' in to ? (to.error ?? null) : db`last_error`},
          next_attempt_at = ${to.status === 'queued' ? db`now() + make_interval(secs => ${to.retryInMs / 1000})` : db`next_attempt_at`},
          claimed_at = ${to.status === 'queued' ? null : db`claimed_at`},
          updated_at = now()
        WHERE workspace_id = ${workspaceId} AND id = ${recipientId} AND status = ANY(${from as RecipientStatus[]})
        RETURNING ${db.unsafe(COLUMNS)}`;
      return rows[0] ?? null;
    },

    /** Skips every still-queued recipient (cancel). Returns how many. */
    async skipQueued(workspaceId: string, mailingId: string, reason: SkipReason): Promise<number> {
      const rows = await db`
        UPDATE mailing_recipients SET status = 'skipped', skip_reason = ${reason}, updated_at = now()
        WHERE workspace_id = ${workspaceId} AND mailing_id = ${mailingId} AND status = 'queued'
        RETURNING id`;
      return rows.length;
    },

    /** Requeues failed recipients, and the `outcome_unknown` ones only when asked (retry-failed). */
    async requeueFailed(workspaceId: string, mailingId: string, includeOutcomeUnknown: boolean): Promise<number> {
      const rows = await db`
        UPDATE mailing_recipients SET status = 'queued', skip_reason = NULL, claimed_at = NULL,
          next_attempt_at = now(), updated_at = now()
        WHERE workspace_id = ${workspaceId} AND mailing_id = ${mailingId}
          AND (status = 'failed' OR (${includeOutcomeUnknown} AND status = 'skipped' AND skip_reason = 'outcome_unknown'))
        RETURNING id`;
      return rows.length;
    },

    /**
     * Rows left `sending` since before `claimedBefore`: what a crashed worker
     * leaves behind, to be reconciled against `messages`. Deliberately not scoped
     * by a workspace (reconciliation serves all of them); each row names its own.
     */
    async listStuckForWorker(
      claimedBefore: Date,
      limit: number,
    ): Promise<Array<{ workspace_id: string; id: string; mailing_id: string }>> {
      return db<Array<{ workspace_id: string; id: string; mailing_id: string }>>`
        SELECT workspace_id, id, mailing_id FROM mailing_recipients
        WHERE status = 'sending' AND claimed_at < ${claimedBefore}
        ORDER BY claimed_at, id LIMIT ${limit}`;
    },

    /** The contact's recipient rows, for erasure. Returns how many were deleted. */
    async deleteForContact(workspaceId: string, contactId: string): Promise<number> {
      const rows = await db`
        DELETE FROM mailing_recipients WHERE workspace_id = ${workspaceId} AND contact_id = ${contactId} RETURNING id`;
      return rows.length;
    },
  };
}
