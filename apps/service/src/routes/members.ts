import { Hono } from 'hono';
import { dashboardOnly, MANAGE, permit, READ_WORKSPACE, requireWorkspace, roleAtLeast } from '../auth.js';
import { actorOf, type AppEnv, type WorkspaceAccess } from '../context.js';
import type { Sql } from '../db.js';
import { ApiError } from '../errors.js';
import { idempotent, workspaceScope } from '../idempotency.js';
import { repos } from '../repo/index.js';
import { IdParams, MemberCreate, MemberUpdate, PageQuery } from '../schemas.js';
import { jsonBody, pageArgs, params, query, toPage } from '../validate.js';

/**
 * The people of a workspace, managed only by people (through the dashboard).
 *
 * Rules:
 * - admins and owners add, re-role and remove members;
 * - anything that makes or unmakes an owner needs an owner;
 * - anyone may leave (remove themselves);
 * - a workspace never loses its last owner, by demotion, removal or leaving
 *   (`last_owner`). Owner rows are locked first, so two owners demoting each
 *   other at once cannot both succeed.
 */
export function memberRoutes(sql: Sql) {
  const app = new Hono<AppEnv>();
  const pool = repos(sql);
  const withWorkspace = requireWorkspace({ findMember: (ws, subject) => pool.members.bySubject(ws, subject) });
  const ledger = () => pool.idempotency;

  function requireOwner(access: WorkspaceAccess, what: string) {
    if (access.via !== 'member' || !roleAtLeast(access.role, 'owner')) {
      throw new ApiError('insufficient_role', `Only an owner can ${what}.`, { required: 'owner' });
    }
  }

  app.get('/v1/members', dashboardOnly, withWorkspace, permit(READ_WORKSPACE), async (c) => {
    const { workspaceId } = c.get('access');
    const q = query(c, PageQuery);
    const page = await pageArgs(q, (id) => pool.members.exists(workspaceId, id));
    const rows = await pool.members.list(workspaceId, { afterId: page.afterId, limit: page.limit + 1 });
    return c.json(toPage(rows, page.limit));
  });

  app.post('/v1/members', dashboardOnly, withWorkspace, permit(MANAGE), idempotent(ledger, workspaceScope), async (c) => {
    const access = c.get('access');
    const input = await jsonBody(c, MemberCreate);
    if (input.role === 'owner') requireOwner(access, 'add another owner');
    const member = await sql.begin(async (tx) => {
      const r = repos(tx);
      const created = await r.members.create(access.workspaceId, {
        subject: input.subject,
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

  app.patch('/v1/members/:id', dashboardOnly, withWorkspace, permit(MANAGE), idempotent(ledger, workspaceScope), async (c) => {
    const access = c.get('access');
    const { id } = params(c, IdParams);
    const input = await jsonBody(c, MemberUpdate);
    const member = await sql.begin(async (tx) => {
      const r = repos(tx);
      const owners = await r.members.lockOwners(access.workspaceId);
      const target = await r.members.byId(access.workspaceId, id);
      if (!target) throw new ApiError('not_found', 'No such member in this workspace.');
      if (target.role === input.role) return target;
      if (target.role === 'owner' || input.role === 'owner') requireOwner(access, 'grant or take away the owner role');
      if (target.role === 'owner' && owners.length <= 1) {
        throw new ApiError('last_owner', "This is the workspace's last owner. Make someone else an owner first.");
      }
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

  // Not behind permit(MANAGE): leaving is allowed to everyone, so the rule is checked inside.
  app.delete('/v1/members/:id', dashboardOnly, withWorkspace, idempotent(ledger, workspaceScope), async (c) => {
    const access = c.get('access');
    if (access.via !== 'member') throw new ApiError('forbidden', 'Only a person can remove members.');
    const { id } = params(c, IdParams);
    const leaving = access.member.id === id;
    if (!leaving && !roleAtLeast(access.role, 'admin')) {
      throw new ApiError('insufficient_role', 'Only an admin or owner can remove other members.', { required: 'admin' });
    }
    await sql.begin(async (tx) => {
      const r = repos(tx);
      const owners = await r.members.lockOwners(access.workspaceId);
      const target = await r.members.byId(access.workspaceId, id);
      if (!target) throw new ApiError('not_found', 'No such member in this workspace.');
      if (target.role === 'owner' && !leaving) requireOwner(access, 'remove an owner');
      if (target.role === 'owner' && owners.length <= 1) {
        throw new ApiError('last_owner', "This is the workspace's last owner. Make someone else an owner first.");
      }
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
  });

  return app;
}
