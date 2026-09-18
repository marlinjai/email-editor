import type { SuppressionReason } from '@marlinjai/mail-contract';
import type { Db } from '../db.js';

/** `topic` is the topic's slug, null for a block on every topic. */
export type SuppressionRow = {
  id: string;
  email: string;
  reason: SuppressionReason;
  topic_id: string | null;
  topic: string | null;
  source_message_id: string | null;
  note: string | null;
  created_at: string;
};

const SELECT = (db0: Db) => db0`
  SELECT s.id, s.email, s.reason, s.topic_id, t.slug AS topic, s.source_message_id, s.note, s.created_at
  FROM suppressions s LEFT JOIN topics t ON t.id = s.topic_id`;

export function suppressionsRepo(db: Db) {
  return {
    /**
     * Adds a block. Idempotent: when the address already has a block for that
     * topic (or for every topic, with a null topic), the existing row is returned
     * with `created` false and left unchanged.
     */
    async create(
      workspaceId: string,
      input: {
        email: string;
        reason: SuppressionReason;
        topicId: string | null;
        sourceMessageId?: string | null;
        note?: string | null;
      },
    ): Promise<{ suppression: SuppressionRow; created: boolean }> {
      const email = input.email.toLowerCase();
      const inserted = await db<{ id: string }[]>`
        INSERT INTO suppressions (workspace_id, email, reason, topic_id, source_message_id, note)
        VALUES (${workspaceId}, ${email}, ${input.reason}, ${input.topicId}, ${input.sourceMessageId ?? null}, ${input.note ?? null})
        ON CONFLICT ON CONSTRAINT suppressions_unique_block DO NOTHING
        RETURNING id`;
      const rows = await db<SuppressionRow[]>`
        ${SELECT(db)}
        WHERE s.workspace_id = ${workspaceId} AND s.email = ${email}
          AND s.topic_id IS NOT DISTINCT FROM ${input.topicId}::uuid`;
      return { suppression: rows[0]!, created: inserted.length > 0 };
    },

    /**
     * Replaces the reason (and the message that caused it) of an existing
     * block. Used only to harden a block: an `unsubscribed` block the person
     * could lift themselves becomes `bounced` or `complained` once the address
     * bounces or complains.
     */
    async harden(
      workspaceId: string,
      suppressionId: string,
      input: { reason: 'bounced' | 'complained'; sourceMessageId: string | null },
    ): Promise<SuppressionRow | null> {
      await db`
        UPDATE suppressions SET reason = ${input.reason}, source_message_id = ${input.sourceMessageId}
        WHERE workspace_id = ${workspaceId} AND id = ${suppressionId}`;
      const rows = await db<SuppressionRow[]>`${SELECT(db)} WHERE s.workspace_id = ${workspaceId} AND s.id = ${suppressionId}`;
      return rows[0] ?? null;
    },

    /**
     * The `bounced` blocks whose source message belongs to a mailing's run
     * (sent since `runStartedAt`, all of them when it is null): what the bounce
     * circuit breaker undoes when it trips.
     */
    async bouncedInRun(workspaceId: string, mailingId: string, runStartedAt: string | null): Promise<SuppressionRow[]> {
      return db<SuppressionRow[]>`
        ${SELECT(db)}
        JOIN messages m ON m.workspace_id = s.workspace_id AND m.id = s.source_message_id
        WHERE s.workspace_id = ${workspaceId} AND s.reason = 'bounced' AND m.mailing_id = ${mailingId}
          AND m.is_test = false
          ${runStartedAt === null ? db`` : db`AND m.created_at >= ${runStartedAt}`}
        ORDER BY s.created_at, s.id`;
    },

    async get(workspaceId: string, suppressionId: string): Promise<SuppressionRow | null> {
      const rows = await db<SuppressionRow[]>`${SELECT(db)} WHERE s.workspace_id = ${workspaceId} AND s.id = ${suppressionId}`;
      return rows[0] ?? null;
    },

    async list(
      workspaceId: string,
      query: { afterId?: string; limit: number; email?: string; reason?: SuppressionReason; topicId?: string },
    ): Promise<SuppressionRow[]> {
      return db<SuppressionRow[]>`
        ${SELECT(db)}
        WHERE s.workspace_id = ${workspaceId}
        ${query.email ? db`AND s.email = ${query.email.toLowerCase()}` : db``}
        ${query.reason ? db`AND s.reason = ${query.reason}` : db``}
        ${query.topicId ? db`AND s.topic_id = ${query.topicId}` : db``}
        ${
          query.afterId
            ? db`AND (s.created_at, s.id) < (SELECT created_at, id FROM suppressions WHERE workspace_id = ${workspaceId} AND id = ${query.afterId})`
            : db``
        }
        ORDER BY s.created_at DESC, s.id DESC
        LIMIT ${query.limit}`;
    },

    async delete(workspaceId: string, suppressionId: string): Promise<boolean> {
      const rows = await db`DELETE FROM suppressions WHERE workspace_id = ${workspaceId} AND id = ${suppressionId} RETURNING id`;
      return rows.length > 0;
    },

    /**
     * The block that stops sending to this address under this topic, if any: a
     * block on every topic, or on this one. Checked by the worker at claim time.
     * An all-topics block is preferred in the answer, since it is the broader one.
     */
    async findBlocking(workspaceId: string, email: string, topicId: string): Promise<SuppressionRow | null> {
      const rows = await db<SuppressionRow[]>`
        ${SELECT(db)}
        WHERE s.workspace_id = ${workspaceId} AND s.email = ${email.toLowerCase()}
          AND (s.topic_id IS NULL OR s.topic_id = ${topicId})
        ORDER BY s.topic_id NULLS FIRST
        LIMIT 1`;
      return rows[0] ?? null;
    },

    /** How many blocks an address has; erasure reports it as `suppressions_kept`. */
    async countForEmail(workspaceId: string, email: string): Promise<number> {
      const rows = await db<{ n: number }[]>`
        SELECT count(*)::int AS n FROM suppressions WHERE workspace_id = ${workspaceId} AND email = ${email.toLowerCase()}`;
      return rows[0]!.n;
    },
  };
}
