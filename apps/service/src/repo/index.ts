import type { Db } from '../db.js';
import { apiKeysRepo } from './api-keys.js';
import { auditRepo } from './audit.js';
import { idempotencyRepo } from './idempotency.js';
import { membersRepo } from './members.js';
import { workspacesRepo } from './workspaces.js';

/**
 * Every query the service runs against workspace-owned data lives behind these
 * repositories, and every such function takes `workspaceId` as its first
 * argument. There is no unscoped query helper: a route cannot read a row of
 * another workspace because no function exists that would let it.
 *
 * Built over a `Db`, which is either the pool or a transaction, so a route can
 * write a change and its audit row atomically: `sql.begin((tx) => repos(tx)...)`.
 */
export function repos(db: Db) {
  return {
    workspaces: workspacesRepo(db),
    members: membersRepo(db),
    apiKeys: apiKeysRepo(db),
    audit: auditRepo(db),
    idempotency: idempotencyRepo(db),
  };
}
export type Repos = ReturnType<typeof repos>;
