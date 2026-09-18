import { Hono } from 'hono';
import { ApiError } from '../api-error.js';
import { actorOf, type AppEnv } from '../context.js';
import type { Sql } from '../db.js';
import { mount, type MountDeps } from '../mount.js';
import { repos } from '../repo/index.js';
import { body, pageArgs, params, query, rowId, toPage } from '../validate.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Contact ids of a tag assignment. Ids are opaque in the contract; one this
 * service could never have issued names no contact, exactly like a well-formed
 * id of another workspace, so both are ignored rather than refused: the answer
 * is the tag with its new count either way, and never tells whether an id
 * exists elsewhere.
 */
function contactIds(ids: readonly string[]): string[] {
  return [...new Set(ids.filter((id) => UUID.test(id)).map((id) => id.toLowerCase()))];
}

function notFound(): never {
  throw new ApiError('not_found', 'No such tag in this workspace.');
}

/**
 * Tags: labels on contacts. The slug is unique per workspace. Assigning and
 * removing are idempotent; deleting a tag takes it off every contact (the
 * schema cascades), and segments that name it then match nobody for it.
 */
export function tagRoutes(sql: Sql, deps: MountDeps) {
  const app = new Hono<AppEnv>();
  const { pool } = deps;

  mount(app, 'tags.list', deps, async (c) => {
    const { workspaceId } = c.get('access');
    const q = query(c, 'tags.list');
    const page = await pageArgs(q, async (id) => (await pool.tags.get(workspaceId, id)) !== null);
    const rows = await pool.tags.list(workspaceId, { afterId: page.afterId, limit: page.limit + 1 });
    return c.json(toPage(rows, page.limit));
  });

  mount(app, 'tags.create', deps, async (c) => {
    const access = c.get('access');
    const input = await body(c, 'tags.create');
    const tag = await sql.begin(async (tx) => {
      const r = repos(tx);
      const created = await r.tags.create(access.workspaceId, { slug: input.slug, name: input.name });
      if (!created) {
        throw new ApiError('already_exists', `A tag with the slug "${input.slug}" already exists in this workspace.`, {
          slug: input.slug,
        });
      }
      await r.audit.record(access.workspaceId, {
        action: 'tag.created',
        actor: actorOf(access),
        targetType: 'tag',
        targetId: created.id,
        details: { slug: created.slug, name: created.name },
      });
      return created;
    });
    return c.json(tag, 201);
  });

  mount(app, 'tags.delete', deps, async (c) => {
    const access = c.get('access');
    const id = rowId(params(c, 'tags.delete').id, 'tag');
    await sql.begin(async (tx) => {
      const r = repos(tx);
      const tag = await r.tags.get(access.workspaceId, id);
      if (!tag) notFound();
      await r.tags.delete(access.workspaceId, id);
      await r.audit.record(access.workspaceId, {
        action: 'tag.deleted',
        actor: actorOf(access),
        targetType: 'tag',
        targetId: id,
        details: { slug: tag.slug, contacts: tag.contact_count },
      });
    });
    return c.json({ ok: true as const });
  });

  mount(app, 'tags.assign', deps, async (c) => {
    const access = c.get('access');
    const id = rowId(params(c, 'tags.assign').id, 'tag');
    const input = await body(c, 'tags.assign');
    const tag = await sql.begin(async (tx) => {
      const r = repos(tx);
      if (!(await r.tags.get(access.workspaceId, id))) notFound();
      const ids = contactIds(input.contact_ids);
      const added = await r.tags.assign(access.workspaceId, [id], ids);
      if (added > 0) {
        await r.audit.record(access.workspaceId, {
          action: 'tag.assigned',
          actor: actorOf(access),
          targetType: 'tag',
          targetId: id,
          details: { requested: input.contact_ids.length, added },
        });
      }
      return (await r.tags.get(access.workspaceId, id))!;
    });
    return c.json(tag);
  });

  mount(app, 'tags.unassign', deps, async (c) => {
    const access = c.get('access');
    const id = rowId(params(c, 'tags.unassign').id, 'tag');
    const input = await body(c, 'tags.unassign');
    const tag = await sql.begin(async (tx) => {
      const r = repos(tx);
      if (!(await r.tags.get(access.workspaceId, id))) notFound();
      const removed = await r.tags.unassign(access.workspaceId, id, contactIds(input.contact_ids));
      if (removed > 0) {
        await r.audit.record(access.workspaceId, {
          action: 'tag.unassigned',
          actor: actorOf(access),
          targetType: 'tag',
          targetId: id,
          details: { requested: input.contact_ids.length, removed },
        });
      }
      return (await r.tags.get(access.workspaceId, id))!;
    });
    return c.json(tag);
  });

  return app;
}
