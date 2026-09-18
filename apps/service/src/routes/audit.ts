import { Hono } from 'hono';
import type { AppEnv } from '../context.js';
import { mount, type MountDeps } from '../mount.js';
import { pageArgs, query, toPage } from '../validate.js';

export function auditRoutes(deps: MountDeps) {
  const app = new Hono<AppEnv>();
  const { pool } = deps;

  mount(app, 'audit.list', deps, async (c) => {
    const { workspaceId } = c.get('access');
    const q = query(c, 'audit.list');
    const page = await pageArgs(q, (id) => pool.audit.exists(workspaceId, id));
    const rows = await pool.audit.list(workspaceId, {
      afterId: page.afterId,
      limit: page.limit + 1,
      action: q.action,
      targetId: q.target_id,
    });
    return c.json(toPage(rows, page.limit));
  });

  return app;
}
