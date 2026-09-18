import { randomUUID } from 'node:crypto';
import { WebhookEvent, type WebhookEventOf, type WebhookEventType } from '@marlinjai/mail-contract';
import type { Db } from './db.js';
import { repos } from './repo/index.js';

/** An event as its emitter describes it: the envelope's id, time and workspace are filled in here. */
export type EventInput = { [T in WebhookEventType]: { type: T; data: WebhookEventOf<T>['data'] } }[WebhookEventType];

/**
 * Writes a webhook event to the outbox.
 *
 * Contract:
 * - Call it with the transaction (`tx`) that makes the change the event reports
 *   (a recipient settled, a contact unsubscribed, a mailing finished). The event
 *   then exists if and only if the change committed: no event for a rolled-back
 *   change, no lost event for a committed one.
 * - It validates the full envelope against the contract's `WebhookEvent`, and
 *   throws on a malformed payload (a ZodError), which rolls the change back
 *   rather than promising the client an event it could not parse.
 * - In the same transaction it queues one `pending` delivery per enabled endpoint
 *   of the workspace subscribed to the type. Sending them is the delivery loop's
 *   job (`webhookDeliveries.claimDueForWorker`), never the emitter's.
 * - Returns the envelope, whose `id` receivers deduplicate on.
 */
export async function emitEvent(tx: Db, workspaceId: string, event: EventInput): Promise<WebhookEvent> {
  const envelope = WebhookEvent.parse({
    id: randomUUID(),
    type: event.type,
    created_at: new Date().toISOString(),
    workspace_id: workspaceId,
    data: event.data,
  });
  await repos(tx).webhookEvents.insertWithDeliveries(workspaceId, envelope);
  return envelope;
}
