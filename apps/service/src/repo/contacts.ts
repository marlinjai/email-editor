import type { Db } from '../db.js';
import { asJson } from './json.js';

/** A contact as stored. `topics` (the subscribed slugs) and `tags` (S4, the tag slugs) are joined in on read. */
export type ContactRow = {
  id: string;
  external_id: string | null;
  email: string;
  first_name: string | null;
  last_name: string | null;
  locale: string | null;
  properties: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type ContactWithTopics = ContactRow & { topics: string[]; tags: string[] };

const COLUMNS = 'id, external_id, email, first_name, last_name, locale, properties, created_at, updated_at';
const COLUMNS_C = 'c.id, c.external_id, c.email, c.first_name, c.last_name, c.locale, c.properties, c.created_at, c.updated_at';
const TOPICS_OF_C = `COALESCE((SELECT array_agg(t.slug ORDER BY t.slug) FROM contact_topic_subscriptions s
  JOIN topics t ON t.id = s.topic_id WHERE s.contact_id = c.id), ARRAY[]::text[]) AS topics,
  COALESCE((SELECT array_agg(g.slug ORDER BY g.slug) FROM contact_tags ct
  JOIN tags g ON g.id = ct.tag_id WHERE ct.contact_id = c.id), ARRAY[]::text[]) AS tags`;

type ContactFields = {
  externalId?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  locale?: string | null;
};

export function contactsRepo(db: Db) {
  return {
    async get(workspaceId: string, contactId: string): Promise<ContactWithTopics | null> {
      const rows = await db<ContactWithTopics[]>`
        SELECT ${db.unsafe(COLUMNS_C)}, ${db.unsafe(TOPICS_OF_C)} FROM contacts c
        WHERE c.workspace_id = ${workspaceId} AND c.id = ${contactId}`;
      return rows[0] ?? null;
    },

    /** The address is lowercased before comparing, as it is before storing. */
    async byEmail(workspaceId: string, email: string): Promise<ContactWithTopics | null> {
      const rows = await db<ContactWithTopics[]>`
        SELECT ${db.unsafe(COLUMNS_C)}, ${db.unsafe(TOPICS_OF_C)} FROM contacts c
        WHERE c.workspace_id = ${workspaceId} AND c.email = ${email.toLowerCase()}`;
      return rows[0] ?? null;
    },

    async byExternalId(workspaceId: string, externalId: string): Promise<ContactWithTopics | null> {
      const rows = await db<ContactWithTopics[]>`
        SELECT ${db.unsafe(COLUMNS_C)}, ${db.unsafe(TOPICS_OF_C)} FROM contacts c
        WHERE c.workspace_id = ${workspaceId} AND c.external_id = ${externalId}`;
      return rows[0] ?? null;
    },

    /**
     * Inserts a contact. Returns null when the email or the external id is
     * already taken in the workspace (a concurrent upsert won): the caller reads
     * the winner and updates it instead.
     */
    async insert(
      workspaceId: string,
      input: ContactFields & { email: string; properties?: Record<string, unknown> },
    ): Promise<ContactRow | null> {
      const rows = await db<ContactRow[]>`
        INSERT INTO contacts (workspace_id, external_id, email, first_name, last_name, locale, properties)
        VALUES (${workspaceId}, ${input.externalId ?? null}, ${input.email.toLowerCase()}, ${input.firstName ?? null},
                ${input.lastName ?? null}, ${input.locale ?? null}, ${asJson(db, input.properties ?? {})})
        ON CONFLICT DO NOTHING
        RETURNING ${db.unsafe(COLUMNS)}`;
      return rows[0] ?? null;
    },

    /**
     * Updates the given fields. `properties` is merged key by key, and a key
     * whose value is null is removed, as the contract's upsert describes.
     * Throws a unique violation (23505) if a new email or external id is taken.
     */
    async update(
      workspaceId: string,
      contactId: string,
      patch: ContactFields & { email?: string; properties?: Record<string, unknown> },
    ): Promise<ContactRow | null> {
      const keep = (v: string | null | undefined, column: string) =>
        v === undefined ? db.unsafe(column) : db`${v}`;
      const rows = await db<ContactRow[]>`
        UPDATE contacts SET
          email = COALESCE(${patch.email?.toLowerCase() ?? null}, email),
          external_id = ${keep(patch.externalId, 'external_id')},
          first_name = ${keep(patch.firstName, 'first_name')},
          last_name = ${keep(patch.lastName, 'last_name')},
          locale = ${keep(patch.locale, 'locale')},
          properties = ${
            patch.properties
              ? db`jsonb_strip_nulls(properties || ${asJson(db, patch.properties)}::jsonb)`
              : db`properties`
          },
          updated_at = now()
        WHERE workspace_id = ${workspaceId} AND id = ${contactId}
        RETURNING ${db.unsafe(COLUMNS)}`;
      return rows[0] ?? null;
    },

    async list(
      workspaceId: string,
      query: { afterId?: string; limit: number; email?: string; externalId?: string; topicId?: string },
    ): Promise<ContactWithTopics[]> {
      return db<ContactWithTopics[]>`
        SELECT ${db.unsafe(COLUMNS_C)}, ${db.unsafe(TOPICS_OF_C)} FROM contacts c
        WHERE c.workspace_id = ${workspaceId}
        ${query.email ? db`AND c.email = ${query.email.toLowerCase()}` : db``}
        ${query.externalId ? db`AND c.external_id = ${query.externalId}` : db``}
        ${
          query.topicId
            ? db`AND EXISTS (SELECT 1 FROM contact_topic_subscriptions s
                 WHERE s.workspace_id = ${workspaceId} AND s.contact_id = c.id AND s.topic_id = ${query.topicId})`
            : db``
        }
        ${
          query.afterId
            ? db`AND (c.created_at, c.id) > (SELECT created_at, id FROM contacts WHERE workspace_id = ${workspaceId} AND id = ${query.afterId})`
            : db``
        }
        ORDER BY c.created_at, c.id
        LIMIT ${query.limit}`;
    },

    /**
     * Deletes the contact row; its subscriptions go with it. Recipient and message
     * rows keep existing with contact_id NULL (the schema's ON DELETE SET NULL):
     * erasing what was sent to the person is the erasure route's explicit job.
     */
    async delete(workspaceId: string, contactId: string): Promise<boolean> {
      const rows = await db`DELETE FROM contacts WHERE workspace_id = ${workspaceId} AND id = ${contactId} RETURNING id`;
      return rows.length > 0;
    },

    /** Replaces the contact's subscriptions with exactly these topic ids. */
    async setSubscriptions(workspaceId: string, contactId: string, topicIds: readonly string[]): Promise<void> {
      await db`
        DELETE FROM contact_topic_subscriptions
        WHERE workspace_id = ${workspaceId} AND contact_id = ${contactId}
          AND NOT (topic_id = ANY(${topicIds as string[]}::uuid[]))`;
      if (topicIds.length === 0) return;
      await db`
        INSERT INTO contact_topic_subscriptions (workspace_id, contact_id, topic_id)
        SELECT ${workspaceId}, ${contactId}, t FROM unnest(${topicIds as string[]}::uuid[]) AS t
        ON CONFLICT DO NOTHING`;
    },

    async subscribe(workspaceId: string, contactId: string, topicId: string): Promise<void> {
      await db`
        INSERT INTO contact_topic_subscriptions (workspace_id, contact_id, topic_id)
        VALUES (${workspaceId}, ${contactId}, ${topicId})
        ON CONFLICT DO NOTHING`;
    },

    /** Returns whether a subscription existed. */
    async unsubscribe(workspaceId: string, contactId: string, topicId: string): Promise<boolean> {
      const rows = await db`
        DELETE FROM contact_topic_subscriptions
        WHERE workspace_id = ${workspaceId} AND contact_id = ${contactId} AND topic_id = ${topicId}
        RETURNING contact_id`;
      return rows.length > 0;
    },

    async isSubscribed(workspaceId: string, contactId: string, topicId: string): Promise<boolean> {
      const rows = await db`
        SELECT 1 FROM contact_topic_subscriptions
        WHERE workspace_id = ${workspaceId} AND contact_id = ${contactId} AND topic_id = ${topicId}`;
      return rows.length > 0;
    },
  };
}
