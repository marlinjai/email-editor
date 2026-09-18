import { Hono } from 'hono';
import { ApiError } from '../api-error.js';
import { roleAtLeast } from '../auth.js';
import { actorOf, type AppEnv, type WorkspaceAccess } from '../context.js';
import type { Sql } from '../db.js';
import { mount, type MountDeps } from '../mount.js';
import { repos } from '../repo/index.js';
import { body, pageArgs, params, query, rowId, toPage } from '../validate.js';

const LAST_OWNER = "This is the workspace's last owner. Make someone else an owner first.";

/**
 * The people of a workspace.
 *
 * Rules, on top of the route table's access levels:
 * - anything that makes or unmakes an owner needs an owner, a person: a key can
 *   never grant or take away the owner role;
 * - anyone may leave (remove themselves), whatever their role;
 * - a workspace never loses its last owner, by demotion, removal or leaving
 *   (`last_owner`). Owner rows are locked first, so two owners demoting each
 *   other at once cannot both succeed.
 */
export function memberRoutes(sql: Sql, deps: MountDeps) {
  const app = new Hono<AppEnv>();
  const { pool } = deps;

  function requireOwner(access: WorkspaceAccess, what: string) {
    if (access.via !== 'member') {
      throw new ApiError('forbidden', `Only an owner, signed in through the dashboard, can ${what}.`);
    }
    if (!roleAtLeast(access.role, 'owner')) {
      throw new ApiError('insufficient_role', `Only an owner can ${what}.`, { required: 'owner', actual: access.role });
    }
  }

  mount(app, 'members.list', deps, async (c) => {
    const { workspaceId } = c.get('access');
    const q = query(c, 'members.list');
    const page = await pageArgs(q, (id) => pool.members.exists(workspaceId, id));
    const rows = await pool.members.list(workspaceId, { afterId: page.afterId, limit: page.limit + 1 });
    return c.json(toPage(rows, page.limit));
  });

  mount(app, 'members.add', deps, async (c) => {
    const access = c.get('access');
    const input = await body(c, 'members.add');
    if (input.role === 'owner') requireOwner(access, 'add another owner');
    const member = await sql.begin(async (tx) => {
      const r = repos(tx);
      const created = await r.members.create(access.workspaceId, {
        subject: input.subject.trim(),
        email: input.email,
        name: input.name ?? null,
        role: input.role,
      });
      if (!created) {
        throw new ApiError('already_exists', 'This person (by auth-brain subject or email) is already a member.');
      }
      await r.audit.record(access.workspaceId, {
        action: 'member.added',
        actor: actorOf(access),
        targetType: 'member',
        targetId: created.id,
        details: { subject: created.subject, role: created.role },
      });
      return created;
    });
    return c.json(member, 201);
  });

  mount(app, 'members.update', deps, async (c) => {
    const access = c.get('access');
    const id = rowId(params(c, 'members.update').id, 'member');
    const input = await body(c, 'members.update');
    const member = await sql.begin(async (tx) => {
      const r = repos(tx);
      const owners = await r.members.lockOwners(access.workspaceId);
      const target = await r.members.byId(access.workspaceId, id);
      if (!target) throw new ApiError('not_found', 'No such member in this workspace.');
      if (target.role === input.role) return target;
      if (target.role === 'owner' || input.role === 'owner') requireOwner(access, 'grant or take away the owner role');
      if (target.role === 'owner' && owners.length <= 1) throw new ApiError('last_owner', LAST_OWNER);
      const updated = await r.members.setRole(access.workspaceId, id, input.role);
      await r.audit.record(access.workspaceId, {
        action: 'member.role_changed',
        actor: actorOf(access),
        targetType: 'member',
        targetId: id,
        details: { from: target.role, to: input.role },
      });
      return updated!;
    });
    return c.json(member);
  });

  // The table's `admin` for removing someone else; leaving is open to every
  // member, so the permission is checked here rather than by the mount.
  mount(
    app,
    'members.remove',
    deps,
    async (c) => {
      const access = c.get('access');
      const id = rowId(params(c, 'members.remove').id, 'member');
      const leaving = access.via === 'member' && access.member.id === id;
      if (!leaving) {
        if (access.via === 'api_key' && access.scope !== 'full') {
          throw new ApiError('forbidden', `This API key's scope (${access.scope}) does not allow this.`, {
            required: ['full'],
            actual: access.scope,
          });
        }
        if (access.via === 'member' && !roleAtLeast(access.role, 'admin')) {
          throw new ApiError('insufficient_role', 'Only an admin or owner can remove other members.', {
            required: 'admin',
            actual: access.role,
          });
        }
      }
      await sql.begin(async (tx) => {
        const r = repos(tx);
        const owners = await r.members.lockOwners(access.workspaceId);
        const target = await r.members.byId(access.workspaceId, id);
        if (!target) throw new ApiError('not_found', 'No such member in this workspace.');
        if (target.role === 'owner' && !leaving) requireOwner(access, 'remove an owner');
        if (target.role === 'owner' && owners.length <= 1) throw new ApiError('last_owner', LAST_OWNER);
        await r.members.remove(access.workspaceId, id);
        await r.audit.record(access.workspaceId, {
          action: 'member.removed',
          actor: actorOf(access),
          targetType: 'member',
          targetId: id,
          details: { subject: target.subject, role: target.role, left: leaving },
        });
      });
      return c.json({ ok: true as const });
    },
    { selfService: true },
  );

  return app;
}
