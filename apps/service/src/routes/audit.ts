import { Hono } from 'hono';
import { permit, READ_ADMIN, requireWorkspace } from '../auth.js';
import type { AppEnv } from '../context.js';
import type { Sql } from '../db.js';
import { repos } from '../repo/index.js';
import { AuditQuery } from '../schemas.js';
import { pageArgs, query, toPage } from '../validate.js';

export function auditRoutes(sql: Sql) {
  const app = new Hono<AppEnv>();
  const pool = repos(sql);
  const withWorkspace = requireWorkspace({ findMember: (ws, subject) => pool.members.bySubject(ws, subject) });

  app.get('/v1/audit-log', withWorkspace, permit(READ_ADMIN), async (c) => {
    const { workspaceId } = c.get('access');
    const q = query(c, AuditQuery);
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
