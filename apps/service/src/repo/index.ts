import type { Db } from '../db.js';
import { apiKeysRepo } from './api-keys.js';
import { assetsRepo } from './assets.js';
import { auditRepo } from './audit.js';
import { contactsRepo } from './contacts.js';
import { idempotencyRepo } from './idempotency.js';
import { mailingsRepo } from './mailings.js';
import { membersRepo } from './members.js';
import { templatesRepo } from './templates.js';
import { messagesRepo } from './messages.js';
import { providerSendsRepo } from './provider-sends.js';
import { providersRepo } from './providers.js';
import { recipientsRepo } from './recipients.js';
import { suppressionsRepo } from './suppressions.js';
import { topicsRepo } from './topics.js';
import { webhookDeliveriesRepo, webhookEndpointsRepo, webhookEventsRepo } from './webhooks.js';
import { workspacesRepo } from './workspaces.js';
import { tagsRepo } from './tags.js';
import { contactPropertiesRepo } from './contact-properties.js';
import { mailingPlatformRepo, workspaceTrackingRepo } from './mailing-platform.js';
import { segmentsRepo } from './segments.js';
import { importsRepo } from './imports.js';

/**
 * Every query the service runs against workspace-owned data lives behind these
 * repositories, and every such function takes `workspaceId` as its first
 * argument. There is no unscoped query helper: a route cannot read a row of
 * another workspace because no function exists that would let it.
 *
 * The exceptions are named and few, each returning only what locates the
 * workspace for the scoped calls that follow, or what serves a caller that has
 * no workspace: `apiKeys.findCredentialByHash` (how a key's workspace is
 * found), `assets.blobForPublicUrl` (an email client fetching an image at
 * `/a/:id`, which returns the bytes' location and never the owning
 * workspace), and the worker's scans across workspaces, all suffixed
 * `ForWorker` (`mailings.listSendingForWorker`, `recipients.listStuckForWorker`,
 * `webhookDeliveries.claimDueForWorker`).
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
    providers: providersRepo(db),
    providerSends: providerSendsRepo(db),
    topics: topicsRepo(db),
    contacts: contactsRepo(db),
    suppressions: suppressionsRepo(db),
    mailings: mailingsRepo(db),
    recipients: recipientsRepo(db),
    messages: messagesRepo(db),
    webhookEndpoints: webhookEndpointsRepo(db),
    webhookEvents: webhookEventsRepo(db),
    webhookDeliveries: webhookDeliveriesRepo(db),
    // S4
    tags: tagsRepo(db),
    contactProperties: contactPropertiesRepo(db),
    mailingPlatform: mailingPlatformRepo(db),
    workspaceTracking: workspaceTrackingRepo(db),
    segments: segmentsRepo(db),
    imports: importsRepo(db),
  };
}
export type Repos = ReturnType<typeof repos>;
