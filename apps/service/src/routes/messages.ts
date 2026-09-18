import { Hono } from 'hono';
import { ApiError } from '../api-error.js';
import type { AppEnv } from '../context.js';
import { mount, type MountDeps } from '../mount.js';
import { pageArgs, params, query, rowId, toPage } from '../validate.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The sent archive: one row per message handed to a provider or refused by it,
 * tests included, newest first. `get` returns the final HTML exactly as sent.
 */
export function messageRoutes(deps: MountDeps) {
  const app = new Hono<AppEnv>();
  const { pool } = deps;

  mount(app, 'messages.list', deps, async (c) => {
    const { workspaceId } = c.get('access');
    const q = query(c, 'messages.list');
    // An id this service never issued names no mailing here: an empty list, as for an unknown one.
    if (q.mailing_id !== undefined && !UUID.test(q.mailing_id)) return c.json({ data: [], next_cursor: null });
    const page = await pageArgs(q, async (id) => (await pool.messages.get(workspaceId, id)) !== null);
    const rows = await pool.messages.list(workspaceId, {
      ...page,
      limit: page.limit + 1,
      mailingId: q.mailing_id?.toLowerCase(),
      outcome: q.outcome,
    });
    return c.json(toPage(rows, page.limit));
  });

  mount(app, 'messages.get', deps, async (c) => {
    const { workspaceId } = c.get('access');
    const message = await pool.messages.get(workspaceId, rowId(params(c, 'messages.get').id, 'message'));
    if (!message) throw new ApiError('not_found', 'No such message in this workspace.');
    return c.json(message);
  });

  return app;
}
