import type { ContactUpsert } from '@marlinjai/mail-contract';
import { Hono } from 'hono';
import { ApiError } from '../api-error.js';
import { actorOf, type AppEnv } from '../context.js';
import type { Db, Sql } from '../db.js';
import { mount, type MountDeps } from '../mount.js';
import { repos } from '../repo/index.js';
import type { ContactWithTopics } from '../repo/contacts.js';
import { body, pageArgs, params, query, rowId, toPage } from '../validate.js';

/** Addresses are stored and compared trimmed and lowercased. */
export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: unknown }).code === '23505';
}

/**
 * The topic ids to subscribe the contact to: the requested slugs, minus every
 * topic the address unsubscribed from (a topic block, or a block on every topic).
 * Suppressions win over what the client sends. An unknown slug is refused.
 */
async function subscribableTopicIds(db: Db, workspaceId: string, email: string, slugs: readonly string[]): Promise<string[]> {
  const r = repos(db);
  const wanted = [...new Set(slugs)];
  const found = await r.topics.bySlugs(workspaceId, wanted);
  if (found.length !== wanted.length) {
    const known = new Set(found.map((t) => t.slug));
    const unknown = wanted.filter((s) => !known.has(s));
    throw new ApiError('unknown_topic', `No such topic in this workspace: ${unknown.join(', ')}.`, { topics: unknown });
  }
  const blocks = await r.suppressions.list(workspaceId, { email, reason: 'unsubscribed', limit: 1000 });
  if (blocks.some((b) => b.topic_id === null)) return [];
  const blocked = new Set(blocks.map((b) => b.topic_id));
  return found.filter((t) => !blocked.has(t.id)).map((t) => t.id);
}

type UpsertOutcome = { contact: ContactWithTopics; created: boolean };

/**
 * One attempt at the upsert inside `tx`. Returns null when a concurrent upsert
 * inserted the same person first, so the caller runs it again and updates that row.
 *
 * Matching: by `external_id` when given, else by `email`. When the external id
 * names one contact and the email another, or the email's contact already
 * carries a different external id, it is a `conflict`: two people would be
 * merged into one, which is never done silently.
 */
async function upsertOnce(tx: Db, workspaceId: string, input: ContactUpsert): Promise<UpsertOutcome | null> {
  const r = repos(tx);
  const email = input.email === undefined ? undefined : normaliseEmail(input.email);
  const byExternal = input.external_id !== undefined ? await r.contacts.byExternalId(workspaceId, input.external_id) : null;
  const byEmail = email !== undefined ? await r.contacts.byEmail(workspaceId, email) : null;

  if (byExternal && byEmail && byExternal.id !== byEmail.id) {
    throw new ApiError('conflict', 'The external_id and the email belong to two different contacts.', {
      external_id_contact_id: byExternal.id,
      email_contact_id: byEmail.id,
    });
  }
  if (!byExternal && byEmail && input.external_id !== undefined && byEmail.external_id !== null) {
    throw new ApiError('conflict', 'The email belongs to a contact with a different external_id.', {
      email_contact_id: byEmail.id,
    });
  }

  const fields = {
    externalId: input.external_id,
    firstName: input.first_name,
    lastName: input.last_name,
    locale: input.locale,
    properties: input.properties,
  };
  const target = byExternal ?? byEmail;
  let id: string;
  let created: boolean;
  if (!target) {
    if (email === undefined) {
      throw new ApiError('validation_failed', 'A new contact needs an email.', {
        issues: [{ path: ['email'], message: 'required when the external_id is new' }],
      });
    }
    // A new contact never stores a property whose value is null (null means "remove").
    const properties = input.properties
      ? Object.fromEntries(Object.entries(input.properties).filter(([, v]) => v !== null))
      : undefined;
    const inserted = await r.contacts.insert(workspaceId, { ...fields, email, properties });
    if (!inserted) return null;
    id = inserted.id;
    created = true;
  } else {
    const updated = await r.contacts.update(workspaceId, target.id, { ...fields, email });
    if (!updated) return null;
    id = updated.id;
    created = false;
  }

  if (input.topics !== undefined) {
    const current = (await r.contacts.get(workspaceId, id))!;
    await r.contacts.setSubscriptions(workspaceId, id, await subscribableTopicIds(tx, workspaceId, current.email, input.topics));
  }
  return { contact: (await r.contacts.get(workspaceId, id))!, created };
}

export function contactRoutes(sql: Sql, deps: MountDeps) {
  const app = new Hono<AppEnv>();
  const { pool } = deps;

  mount(app, 'contacts.upsert', deps, async (c) => {
    const { workspaceId } = c.get('access');
    const input = await body(c, 'contacts.upsert');
    // Two attempts: the second one finds the row a concurrent upsert inserted.
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const outcome = await sql.begin((tx) => upsertOnce(tx, workspaceId, input));
        if (outcome) return c.json(outcome);
      } catch (err) {
        if (!isUniqueViolation(err)) throw err;
        if (attempt === 1) {
          throw new ApiError('conflict', 'The email or external_id is already used by another contact.');
        }
      }
    }
    throw new ApiError('conflict', 'The contact changed while it was being saved. Retry the request.');
  });

  mount(app, 'contacts.list', deps, async (c) => {
    const { workspaceId } = c.get('access');
    const q = query(c, 'contacts.list');
    let topicId: string | undefined;
    if (q.topic !== undefined) {
      const topic = await pool.topics.bySlug(workspaceId, q.topic);
      if (!topic) throw new ApiError('unknown_topic', `No such topic in this workspace: ${q.topic}.`, { topics: [q.topic] });
      topicId = topic.id;
    }
    const page = await pageArgs(q, async (id) => (await pool.contacts.get(workspaceId, id)) !== null);
    const rows = await pool.contacts.list(workspaceId, {
      afterId: page.afterId,
      limit: page.limit + 1,
      email: q.email === undefined ? undefined : normaliseEmail(q.email),
      externalId: q.external_id,
      topicId,
    });
    return c.json(toPage(rows, page.limit));
  });

  mount(app, 'contacts.get', deps, async (c) => {
    const { workspaceId } = c.get('access');
    const id = rowId(params(c, 'contacts.get').id, 'contact');
    const contact = await pool.contacts.get(workspaceId, id);
    if (!contact) throw new ApiError('not_found', 'No such contact in this workspace.');
    return c.json(contact);
  });

  /**
   * Erasure (Art. 17 GDPR). In one transaction: the messages archived for the
   * person (their HTML included), their recipient rows, then the contact itself.
   * Suppressions stay, so the address is still never emailed against its wish.
   * The audit row records the counts, never the address.
   */
  mount(app, 'contacts.erase', deps, async (c) => {
    const access = c.get('access');
    const id = rowId(params(c, 'contacts.erase').id, 'contact');
    const result = await sql.begin(async (tx) => {
      const r = repos(tx);
      const contact = await r.contacts.get(access.workspaceId, id);
      if (!contact) throw new ApiError('not_found', 'No such contact in this workspace.');
      const erasedMessages = await r.messages.deleteForContact(access.workspaceId, id);
      const erasedRecipients = await r.recipients.deleteForContact(access.workspaceId, id);
      await r.contacts.delete(access.workspaceId, id);
      const suppressionsKept = await r.suppressions.countForEmail(access.workspaceId, contact.email);
      await r.audit.record(access.workspaceId, {
        action: 'contact.erased',
        actor: actorOf(access),
        targetType: 'contact',
        targetId: id,
        details: { erased_messages: erasedMessages, erased_recipients: erasedRecipients, suppressions_kept: suppressionsKept },
      });
      return {
        ok: true as const,
        erased_messages: erasedMessages,
        erased_recipients: erasedRecipients,
        suppressions_kept: suppressionsKept,
      };
    });
    return c.json(result);
  });

  mount(app, 'contacts.messages', deps, async (c) => {
    const { workspaceId } = c.get('access');
    const id = rowId(params(c, 'contacts.messages').id, 'contact');
    if (!(await pool.contacts.get(workspaceId, id))) throw new ApiError('not_found', 'No such contact in this workspace.');
    const q = query(c, 'contacts.messages');
    const page = await pageArgs(q, async (messageId) => (await pool.messages.get(workspaceId, messageId))?.contact_id === id);
    const rows = await pool.messages.list(workspaceId, { afterId: page.afterId, limit: page.limit + 1, contactId: id });
    return c.json(toPage(rows, page.limit));
  });

  return app;
}
