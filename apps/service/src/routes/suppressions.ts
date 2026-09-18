import { Hono } from 'hono';
import { ApiError } from '../api-error.js';
import { actorOf, type AppEnv } from '../context.js';
import type { Sql } from '../db.js';
import { emitEvent } from '../events.js';
import { mount, type MountDeps } from '../mount.js';
import { repos } from '../repo/index.js';
import type { SuppressionRow } from '../repo/suppressions.js';
import { body, pageArgs, params, query, rowId, toPage } from '../validate.js';
import { normaliseEmail } from './contacts.js';

/** The contract's `Suppression`: the topic by slug, the internal topic id left out. */
function toSuppression(row: SuppressionRow) {
  return {
    id: row.id,
    email: row.email,
    reason: row.reason,
    topic: row.topic,
    source_message_id: row.source_message_id,
    note: row.note,
    created_at: row.created_at,
  };
}

/**
 * Blocks on addresses. A block with a topic stops that topic; a block without
 * one stops every topic, and the two coexist (one of each per address and
 * topic): lifting a topic block leaves an all-topics block in force, and the
 * other way round.
 */
export function suppressionRoutes(sql: Sql, deps: MountDeps) {
  const app = new Hono<AppEnv>();
  const { pool } = deps;

  mount(app, 'suppressions.list', deps, async (c) => {
    const { workspaceId } = c.get('access');
    const q = query(c, 'suppressions.list');
    let topicId: string | undefined;
    if (q.topic !== undefined) {
      const topic = await pool.topics.bySlug(workspaceId, q.topic);
      if (!topic) throw new ApiError('unknown_topic', `No such topic in this workspace: ${q.topic}.`, { topics: [q.topic] });
      topicId = topic.id;
    }
    const page = await pageArgs(q, async (id) => (await pool.suppressions.get(workspaceId, id)) !== null);
    const rows = await pool.suppressions.list(workspaceId, {
      afterId: page.afterId,
      limit: page.limit + 1,
      email: q.email === undefined ? undefined : normaliseEmail(q.email),
      reason: q.reason,
      topicId,
    });
    const { data, next_cursor } = toPage(rows, page.limit);
    return c.json({ data: data.map(toSuppression), next_cursor });
  });

  /**
   * Adds a block. Idempotent on (address, topic): an existing block is returned
   * unchanged. A new `unsubscribed` block reports `contact.unsubscribed` in the
   * same transaction, so the event exists exactly when the block does.
   */
  mount(app, 'suppressions.create', deps, async (c) => {
    const access = c.get('access');
    const input = await body(c, 'suppressions.create');
    const email = normaliseEmail(input.email);
    const suppression = await sql.begin(async (tx) => {
      const r = repos(tx);
      let topicId: string | null = null;
      if (input.topic) {
        const topic = await r.topics.bySlug(access.workspaceId, input.topic);
        if (!topic) throw new ApiError('unknown_topic', `No such topic in this workspace: ${input.topic}.`, { topics: [input.topic] });
        topicId = topic.id;
      }
      const { suppression: row, created } = await r.suppressions.create(access.workspaceId, {
        email,
        reason: input.reason,
        topicId,
        note: input.note ?? null,
      });
      if (!created) return row;
      await r.audit.record(access.workspaceId, {
        action: 'suppression.created',
        actor: actorOf(access),
        targetType: 'suppression',
        targetId: row.id,
        details: { reason: row.reason, topic: row.topic },
      });
      if (row.reason === 'unsubscribed') {
        const contact = await r.contacts.byEmail(access.workspaceId, email);
        if (contact && topicId) await r.contacts.unsubscribe(access.workspaceId, contact.id, topicId);
        if (contact && !topicId) await r.contacts.setSubscriptions(access.workspaceId, contact.id, []);
        await emitEvent(tx, access.workspaceId, {
          type: 'contact.unsubscribed',
          data: {
            contact_id: contact?.id ?? null,
            external_id: contact?.external_id ?? null,
            email,
            topic: row.topic,
            mailing_id: null,
            source: access.via === 'member' ? 'dashboard' : 'api',
            unsubscribed_at: row.created_at,
          },
        });
      }
      return row;
    });
    return c.json(toSuppression(suppression), 201);
  });

  /**
   * Lifts a block. Lifting an `unsubscribed` block is an opt-in again, so it
   * reports `contact.resubscribed` in the same transaction, the mirror of
   * `contact.unsubscribed` on create; lifting a bounce, complaint or manual block
   * reports nothing. The contact's topic subscriptions are left as they are: the
   * client re-sends them with its next upsert, which the block no longer filters.
   */
  mount(app, 'suppressions.delete', deps, async (c) => {
    const access = c.get('access');
    const id = rowId(params(c, 'suppressions.delete').id, 'suppression');
    await sql.begin(async (tx) => {
      const r = repos(tx);
      const existing = await r.suppressions.get(access.workspaceId, id);
      if (!existing || !(await r.suppressions.delete(access.workspaceId, id))) {
        throw new ApiError('not_found', 'No such suppression in this workspace.');
      }
      await r.audit.record(access.workspaceId, {
        action: 'suppression.deleted',
        actor: actorOf(access),
        targetType: 'suppression',
        targetId: id,
        details: { reason: existing.reason, topic: existing.topic },
      });
      if (existing.reason === 'unsubscribed') {
        const contact = await r.contacts.byEmail(access.workspaceId, existing.email);
        await emitEvent(tx, access.workspaceId, {
          type: 'contact.resubscribed',
          data: {
            contact_id: contact?.id ?? null,
            external_id: contact?.external_id ?? null,
            email: existing.email,
            topic: existing.topic,
            mailing_id: null,
            source: access.via === 'member' ? 'dashboard' : 'api',
            resubscribed_at: new Date().toISOString(),
          },
        });
      }
    });
    return c.json({ ok: true as const });
  });

  return app;
}
