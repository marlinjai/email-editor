import type { Db } from '../db.js';
import { apiKeysRepo } from './api-keys.js';
import { assetsRepo } from './assets.js';
import { auditRepo } from './audit.js';
import { idempotencyRepo } from './idempotency.js';
import { membersRepo } from './members.js';
import { templatesRepo } from './templates.js';
import { workspacesRepo } from './workspaces.js';

/**
 * Every query the service runs against workspace-owned data lives behind these
 * repositories, and every such function takes `workspaceId` as its first
 * argument. There is no unscoped query helper: a route cannot read a row of
 * another workspace because no function exists that would let it.
 *
 * Two lookups are deliberately unscoped, because they are how a caller without
 * a workspace is served: `apiKeys.findCredentialByHash` (finding the workspace
 * a presented key belongs to) and `assets.blobForPublicUrl` (an email client
 * fetching an image at `/a/:id`, which returns the bytes' location and never
 * the owning workspace).
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
    templates: templatesRepo(db),
    assets: assetsRepo(db),
  };
}
export type Repos = ReturnType<typeof repos>;
