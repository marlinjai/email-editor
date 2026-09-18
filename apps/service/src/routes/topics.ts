import { Hono } from 'hono';
import { ApiError } from '../api-error.js';
import { actorOf, type AppEnv } from '../context.js';
import type { Sql } from '../db.js';
import { mount, type MountDeps } from '../mount.js';
import { repos } from '../repo/index.js';
import { body, pageArgs, params, query, rowId, toPage } from '../validate.js';

/**
 * Preference topics. The slug is unique per workspace and never changes, since
 * clients and subscriptions address topics by it. There is no delete route in
 * the contract; the schema refuses to delete a topic a mailing still uses.
 */
export function topicRoutes(sql: Sql, deps: MountDeps) {
  const app = new Hono<AppEnv>();
  const { pool } = deps;

  mount(app, 'topics.list', deps, async (c) => {
    const { workspaceId } = c.get('access');
    const q = query(c, 'topics.list');
    const page = await pageArgs(q, async (id) => (await pool.topics.get(workspaceId, id)) !== null);
    const rows = await pool.topics.list(workspaceId, { afterId: page.afterId, limit: page.limit + 1 });
    return c.json(toPage(rows, page.limit));
  });

  mount(app, 'topics.create', deps, async (c) => {
    const access = c.get('access');
    const input = await body(c, 'topics.create');
    const topic = await sql.begin(async (tx) => {
      const r = repos(tx);
      const created = await r.topics.create(access.workspaceId, {
        slug: input.slug,
        name: input.name,
        description: input.description ?? null,
        translations: input.translations ?? {},
      });
      if (!created) {
        throw new ApiError('already_exists', `A topic with the slug "${input.slug}" already exists in this workspace.`, {
          slug: input.slug,
        });
      }
      await r.audit.record(access.workspaceId, {
        action: 'topic.created',
        actor: actorOf(access),
        targetType: 'topic',
        targetId: created.id,
        details: { slug: created.slug, name: created.name },
      });
      return created;
    });
    return c.json(topic, 201);
  });

  mount(app, 'topics.update', deps, async (c) => {
    const access = c.get('access');
    const id = rowId(params(c, 'topics.update').id, 'topic');
    const input = await body(c, 'topics.update');
    const topic = await sql.begin(async (tx) => {
      const r = repos(tx);
      const updated = await r.topics.update(access.workspaceId, id, {
        name: input.name,
        description: input.description,
        translations: input.translations,
      });
      if (!updated) throw new ApiError('not_found', 'No such topic in this workspace.');
      await r.audit.record(access.workspaceId, {
        action: 'topic.updated',
        actor: actorOf(access),
        targetType: 'topic',
        targetId: id,
        details: { slug: updated.slug, fields: Object.keys(input) },
      });
      return updated;
    });
    return c.json(topic);
  });

  return app;
}
