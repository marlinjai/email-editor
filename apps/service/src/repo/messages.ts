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
