import { Hono } from 'hono';
import { ApiError } from '../api-error.js';
import { actorOf, type AppEnv } from '../context.js';
import type { Sql } from '../db.js';
import { mount, type MountDeps } from '../mount.js';
import { repos } from '../repo/index.js';
import { body, pageArgs, query, toPage } from '../validate.js';
import { DEFAULT_WORKSPACE_SETTINGS, mergeSettings } from '../workspace-settings.js';

function subjectOf(c: { get(key: 'caller'): AppEnv['Variables']['caller'] }): string {
  const caller = c.get('caller');
  if (caller.kind !== 'dashboard') throw new ApiError('forbidden', 'Only a signed-in person has workspaces.');
  return caller.subject;
}

export function workspaceRoutes(sql: Sql, deps: MountDeps) {
  const app = new Hono<AppEnv>();
  const { pool } = deps;

  // The acting person becomes the new workspace's first owner.
  mount(app, 'workspaces.create', deps, async (c) => {
    const subject = subjectOf(c);
    const input = await body(c, 'workspaces.create');
    const settings = mergeSettings(DEFAULT_WORKSPACE_SETTINGS, input.settings);

    const workspace = await sql.begin(async (tx) => {
      const r = repos(tx);
      const created = await r.workspaces.create({
        slug: input.slug,
        name: input.name,
        settings,
        companyId: input.company_id ?? null,
      });
      if (!created) throw new ApiError('already_exists', `A workspace with the slug "${input.slug}" already exists.`);
      const owner = await r.members.create(created.id, {
        subject,
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
        details: { slug: created.slug, name: created.name, company_id: created.company_id },
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
  mount(app, 'workspaces.list', deps, async (c) => {
    const subject = subjectOf(c);
    const q = query(c, 'workspaces.list');
    const page = await pageArgs(q, (id) => pool.workspaces.subjectBelongsTo(subject, id));
    const rows = await pool.workspaces.listForSubject(subject, { afterId: page.afterId, limit: page.limit + 1 });
    return c.json(toPage(rows, page.limit));
  });

  mount(app, 'workspace.get', deps, async (c) => {
    const workspace = await pool.workspaces.get(c.get('access').workspaceId);
    if (!workspace) throw new ApiError('not_found', 'The workspace no longer exists.');
    return c.json(workspace);
  });

  mount(app, 'workspace.update', deps, async (c) => {
    const access = c.get('access');
    const input = await body(c, 'workspace.update');
    const updated = await sql.begin(async (tx) => {
      const r = repos(tx);
      const current = await r.workspaces.get(access.workspaceId);
      if (!current) throw new ApiError('not_found', 'The workspace no longer exists.');
      const settings = input.settings ? mergeSettings(current.settings, input.settings) : undefined;
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
