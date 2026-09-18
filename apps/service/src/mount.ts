import { acceptsIdempotencyKey, routes, type OperationId, type RouteDef } from '@marlinjai/mail-contract';
import type { Context, Hono, MiddlewareHandler } from 'hono';
import { dashboardOnly, permit, requireWorkspace } from './auth.js';
import type { AppEnv } from './context.js';
import { idempotent, subjectScope, workspaceScope } from './idempotency.js';
import type { Repos } from './repo/index.js';
import type { Sealer } from './sealing.js';

export type MountDeps = { pool: Repos; sealer: Sealer };

export type MountOptions = {
  /**
   * The handler enforces its own permission instead of the route's access level.
   * Only for a rule the table cannot express: removing yourself from a workspace
   * is allowed to every member, while removing someone else needs `admin`.
   */
  selfService?: boolean;
};

/**
 * Registers the handler for one operation of the contract's route table. The
 * method, the path, who may call it and whether it takes an Idempotency-Key all
 * come from `routes[id]` in `@marlinjai/mail-contract`, so the service cannot
 * drift from the table the SDK and the dashboard are generated against.
 */
export function mount(
  app: Hono<AppEnv>,
  id: OperationId,
  deps: MountDeps,
  handler: (c: Context<AppEnv>) => Promise<Response>,
  options: MountOptions = {},
): void {
  const def = routes[id] as RouteDef;
  const chain: MiddlewareHandler<AppEnv>[] = [];
  const ledger = () => deps.pool.idempotency;

  switch (def.access) {
    case 'public':
      break;
    case 'dashboard':
      chain.push(dashboardOnly);
      if (acceptsIdempotencyKey(def)) chain.push(idempotent(ledger, deps.sealer, subjectScope));
      break;
    default:
      chain.push(requireWorkspace({ findMember: (ws, subject) => deps.pool.members.bySubject(ws, subject) }));
      if (!options.selfService) chain.push(permit(def.access));
      if (acceptsIdempotencyKey(def)) chain.push(idempotent(ledger, deps.sealer, workspaceScope));
  }

  app.on(def.method, [def.path], ...chain, handler);
}
