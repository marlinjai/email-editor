import type { MessageOutcome } from '@marlinjai/mail-contract';
import type { Db } from '../db.js';

export type MessageSummaryRow = {
  id: string;
  mailing_id: string | null;
  recipient_id: string | null;
  contact_id: string | null;
  to: string;
  subject: string;
  provider_id: string;
  provider_message_id: string | null;
  outcome: MessageOutcome;
  error: string | null;
  is_test: boolean;
  recipient_count: number;
  created_at: string;
};
export type MessageRow = MessageSummaryRow & { html: string };

/** A message of a mailing's run as the bounce circuit breaker sees it. */
export type RunMessage = {
  id: string;
  error: string | null;
  rejection_class: 'recipient' | 'sender' | 'unknown' | null;
  rejection_signature: string | null;
};

const SUMMARY = `id, mailing_id, recipient_id, contact_id, to_email AS "to", subject, provider_id, provider_message_id,
  outcome, error, is_test, recipient_count, created_at`;

export function messagesRepo(db: Db) {
  return {
    /** Archives one message. Write it in the same transaction as the recipient's final status. */
    async insert(
      workspaceId: string,
      input: {
        mailingId: string | null;
        recipientId: string | null;
        contactId: string | null;
        to: string;
        subject: string;
        html: string;
        providerId: string;
        providerMessageId: string | null;
        outcome: MessageOutcome;
        error: string | null;
        isTest: boolean;
        recipientCount: number;
      },
    ): Promise<MessageRow> {
      const rows = await db<MessageRow[]>`
        INSERT INTO messages (workspace_id, mailing_id, recipient_id, contact_id, to_email, subject, html, provider_id,
                              provider_message_id, outcome, error, is_test, recipient_count)
        VALUES (${workspaceId}, ${input.mailingId}, ${input.recipientId}, ${input.contactId}, ${input.to.toLowerCase()},
                ${input.subject}, ${input.html}, ${input.providerId}, ${input.providerMessageId}, ${input.outcome},
                ${input.error}, ${input.isTest}, ${input.recipientCount})
        RETURNING ${db.unsafe(SUMMARY)}, html`;
      return rows[0]!;
    },

    async get(workspaceId: string, messageId: string): Promise<MessageRow | null> {
      const rows = await db<MessageRow[]>`
        SELECT ${db.unsafe(SUMMARY)}, html FROM messages WHERE workspace_id = ${workspaceId} AND id = ${messageId}`;
      return rows[0] ?? null;
    },

    async list(
      workspaceId: string,
      query: { afterId?: string; limit: number; mailingId?: string; contactId?: string; outcome?: MessageOutcome },
    ): Promise<MessageSummaryRow[]> {
      return db<MessageSummaryRow[]>`
        SELECT ${db.unsafe(SUMMARY)} FROM messages
        WHERE workspace_id = ${workspaceId}
        ${query.mailingId ? db`AND mailing_id = ${query.mailingId}` : db``}
        ${query.contactId ? db`AND contact_id = ${query.contactId}` : db``}
        ${query.outcome ? db`AND outcome = ${query.outcome}` : db``}
        ${
          query.afterId
            ? db`AND (created_at, id) < (SELECT created_at, id FROM messages WHERE workspace_id = ${workspaceId} AND id = ${query.afterId})`
            : db``
        }
        ORDER BY created_at DESC, id DESC
        LIMIT ${query.limit}`;
    },

    /**
     * The message a provider event names, by the provider's id for it, within
     * one provider of one workspace.
     */
    async byProviderMessageId(workspaceId: string, providerId: string, providerMessageId: string): Promise<MessageSummaryRow | null> {
      const rows = await db<MessageSummaryRow[]>`
        SELECT ${db.unsafe(SUMMARY)} FROM messages
        WHERE workspace_id = ${workspaceId} AND provider_id = ${providerId} AND provider_message_id = ${providerMessageId}
        ORDER BY created_at DESC, id DESC LIMIT 1`;
      return rows[0] ?? null;
    },

    /** Records how the worker classified a permanent rejection of this message. */
    async setRejection(
      workspaceId: string,
      messageId: string,
      input: { rejectionClass: 'recipient' | 'sender' | 'unknown'; signature: string },
    ): Promise<void> {
      await db`
        UPDATE messages SET rejection_class = ${input.rejectionClass}, rejection_signature = ${input.signature}
        WHERE workspace_id = ${workspaceId} AND id = ${messageId}`;
    },

    /**
     * The first and the last messages of a mailing's run (sent since
     * `runStartedAt`, all of them when it is null), test sends excluded, each
     * oldest first.
     */
    async runOf(
      workspaceId: string,
      mailingId: string,
      runStartedAt: string | null,
      counts: { first: number; last: number },
    ): Promise<{ first: RunMessage[]; last: RunMessage[] }> {
      const since = runStartedAt === null ? db`` : db`AND created_at >= ${runStartedAt}`;
      const first = await db<RunMessage[]>`
        SELECT id, error, rejection_class, rejection_signature FROM messages
        WHERE workspace_id = ${workspaceId} AND mailing_id = ${mailingId} AND is_test = false ${since}
        ORDER BY created_at, id LIMIT ${counts.first}`;
      const last = await db<RunMessage[]>`
        SELECT id, error, rejection_class, rejection_signature FROM messages
        WHERE workspace_id = ${workspaceId} AND mailing_id = ${mailingId} AND is_test = false ${since}
        ORDER BY created_at DESC, id DESC LIMIT ${counts.last}`;
      return { first, last: last.reverse() };
    },

    /**
     * A provider's latest messages within the last 24 hours and since an admin
     * last cleared its anomaly, test sends included, oldest first.
     */
    async recentOfProvider(workspaceId: string, providerId: string, limit: number): Promise<RunMessage[]> {
      const rows = await db<RunMessage[]>`
        SELECT m.id, m.error, m.rejection_class, m.rejection_signature FROM messages m
        JOIN providers p ON p.workspace_id = m.workspace_id AND p.id = m.provider_id
        WHERE m.workspace_id = ${workspaceId} AND m.provider_id = ${providerId}
          AND m.created_at > now() - interval '24 hours'
          AND (p.breaker_reset_at IS NULL OR m.created_at > p.breaker_reset_at)
        ORDER BY m.created_at DESC, m.id DESC LIMIT ${limit}`;
      return rows.reverse();
    },

    /** The latest message archived for a queue row: how a crashed send is reconciled. */
    async latestForRecipient(workspaceId: string, recipientId: string): Promise<MessageSummaryRow | null> {
      const rows = await db<MessageSummaryRow[]>`
        SELECT ${db.unsafe(SUMMARY)} FROM messages
        WHERE workspace_id = ${workspaceId} AND recipient_id = ${recipientId}
        ORDER BY created_at DESC, id DESC LIMIT 1`;
      return rows[0] ?? null;
    },

    /** Erasure: the messages (and their HTML) sent to this contact. Returns how many. */
    async deleteForContact(workspaceId: string, contactId: string): Promise<number> {
      const rows = await db`DELETE FROM messages WHERE workspace_id = ${workspaceId} AND contact_id = ${contactId} RETURNING id`;
      return rows.length;
    },
  };
}
