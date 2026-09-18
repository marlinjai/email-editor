import { Hono } from 'hono';
import { dashboardOnly, MANAGE, permit, READ_WORKSPACE, requireWorkspace } from '../auth.js';
import { actorOf, type AppEnv } from '../context.js';
import type { Sql } from '../db.js';
import { ApiError } from '../errors.js';
import { idempotent, subjectScope, workspaceScope } from '../idempotency.js';
import { repos } from '../repo/index.js';
import {
  DEFAULT_WORKSPACE_SETTINGS,
  settingsProblem,
  WorkspaceCreate,
  WorkspaceUpdate,
  type WorkspaceSettings,
} from '../schemas.js';
import { jsonBody } from '../validate.js';

function mergedSettings(base: WorkspaceSettings, patch: Partial<WorkspaceSettings> | undefined): WorkspaceSettings {
  const merged = { ...base, ...(patch ?? {}) };
  const problem = settingsProblem(merged);
  if (problem) {
    throw new ApiError('validation_failed', 'The workspace settings are not valid.', {
      issues: [{ path: ['settings', 'default_locale'], message: problem }],
    });
  }
  return merged;
}

export function workspaceRoutes(sql: Sql) {
  const app = new Hono<AppEnv>();
  const pool = repos(sql);
  const withWorkspace = requireWorkspace({ findMember: (ws, subject) => pool.members.bySubject(ws, subject) });
  const ledger = () => pool.idempotency;

  // Creating a workspace: dashboard only. The acting person becomes its first owner.
  app.post('/v1/workspaces', dashboardOnly, idempotent(ledger, subjectScope), async (c) => {
    const caller = c.get('caller');
    if (caller.kind !== 'dashboard') throw new ApiError('forbidden', 'Only a person can create a workspace.');
    const input = await jsonBody(c, WorkspaceCreate);
    const settings = mergedSettings(DEFAULT_WORKSPACE_SETTINGS, input.settings);

    const workspace = await sql.begin(async (tx) => {
      const r = repos(tx);
      const created = await r.workspaces.create({ slug: input.slug, name: input.name, settings });
      if (!created) throw new ApiError('already_exists', `A workspace with the slug "${input.slug}" already exists.`);
      const owner = await r.members.create(created.id, {
        subject: caller.subject,
        email: input.owner.email,
        name: input.owner.name ?? null,
        role: 'owner',
      });
      if (!owner) throw new Error('owner insert into a brand-new workspace conflicted');
      const actor = { type: 'member', member_id: owner.id, subject: owner.subject } as const;
      await r.audit.record(created.id, {
        action: 'workspace.created',
        actor,
        targetType: 'workspace',
        targetId: created.id,
        details: { slug: created.slug, name: created.name },
      });
      await r.audit.record(created.id, {
        action: 'member.added',
        actor,
        targetType: 'member',
        targetId: owner.id,
        details: { subject: owner.subject, role: owner.role },
      });
      return created;
    });
    return c.json(workspace, 201);
  });

  // The workspaces the signed-in person belongs to, for the dashboard's switcher.
  app.get('/v1/workspaces', dashboardOnly, async (c) => {
    const caller = c.get('caller');
    if (caller.kind !== 'dashboard') throw new ApiError('forbidden', 'Only a person has workspaces.');
    const rows = await pool.workspaces.listForSubject(caller.subject);
    return c.json({ data: rows, next_cursor: null });
  });

  app.get('/v1/workspace', withWorkspace, permit(READ_WORKSPACE), async (c) => {
    const workspace = await pool.workspaces.get(c.get('access').workspaceId);
    if (!workspace) throw new ApiError('not_found', 'The workspace no longer exists.');
    return c.json(workspace);
  });

  app.patch('/v1/workspace', withWorkspace, permit(MANAGE), idempotent(ledger, workspaceScope), async (c) => {
    const access = c.get('access');
    const input = await jsonBody(c, WorkspaceUpdate);
    const updated = await sql.begin(async (tx) => {
      const r = repos(tx);
      const current = await r.workspaces.get(access.workspaceId);
      if (!current) throw new ApiError('not_found', 'The workspace no longer exists.');
      const settings = input.settings ? mergedSettings(current.settings, input.settings) : undefined;
      const next = await r.workspaces.update(access.workspaceId, { name: input.name, settings });
      await r.audit.record(access.workspaceId, {
        action: 'workspace.updated',
        actor: actorOf(access),
        targetType: 'workspace',
        targetId: access.workspaceId,
        details: { fields: Object.keys(input) },
      });
      return next!;
    });
    return c.json(updated);
  });

  return app;
}
