import type { AuditActor, ProviderKind } from '@marlinjai/mail-contract';
import type { Db } from './db.js';
import { emitEvent } from './events.js';
import { repos } from './repo/index.js';
import { rejectionAction } from './transport/rejection.js';
import type { SendError } from './transport/types.js';

/**
 * Suppression of addresses that bounce or complain. The service owns it: every
 * hard bounce and every spam complaint it learns of blocks the address on every
 * topic, whatever the client does.
 */

export type BounceOutcome = 'suppressed' | 'already_suppressed';

/**
 * Blocks an address after a hard bounce or a spam complaint, and emits
 * `contact.bounced`, inside the caller's transaction (the one that records what
 * the provider said), so the block and the event exist together or not at all.
 *
 * - A new block on every topic is created with `source_message_id` set to the
 *   message that bounced, when it is known.
 * - An existing block on every topic that the person could lift themselves
 *   (`unsubscribed`), or a `bounced` block that now also drew a complaint, is
 *   hardened to the new reason, since sending to that address again would hurt
 *   the sender. A `manual` block, or one already as strong, is left as it is:
 *   `already_suppressed`, and no event.
 */
export async function suppressBounce(
  tx: Db,
  workspaceId: string,
  input: {
    email: string;
    reason: 'bounced' | 'complained';
    message: { id: string; contact_id: string | null } | null;
    diagnostic: string | null;
    actor: AuditActor;
  },
): Promise<BounceOutcome> {
  const r = repos(tx);
  const email = input.email.trim().toLowerCase();
  const sourceMessageId = input.message?.id ?? null;
  const { suppression, created } = await r.suppressions.create(workspaceId, {
    email,
    reason: input.reason,
    topicId: null,
    sourceMessageId,
  });
  let row = suppression;
  let replaced: string | null = null;
  if (!created) {
    const harden = row.reason === 'unsubscribed' || (row.reason === 'bounced' && input.reason === 'complained');
    if (!harden) return 'already_suppressed';
    replaced = row.reason;
    row = (await r.suppressions.harden(workspaceId, row.id, { reason: input.reason, sourceMessageId }))!;
  }
  await r.audit.record(workspaceId, {
    action: 'suppression.created',
    actor: input.actor,
    targetType: 'suppression',
    targetId: row.id,
    details: { reason: row.reason, topic: null, source_message_id: sourceMessageId, ...(replaced ? { replaced_reason: replaced } : {}) },
  });
  const contact = input.message?.contact_id
    ? await r.contacts.get(workspaceId, input.message.contact_id)
    : await r.contacts.byEmail(workspaceId, email);
  await emitEvent(tx, workspaceId, {
    type: 'contact.bounced',
    data: {
      contact_id: contact?.id ?? null,
      external_id: contact?.external_id ?? null,
      email,
      reason: input.reason,
      message_id: sourceMessageId,
      diagnostic: input.diagnostic === null ? null : input.diagnostic.slice(0, 1000),
      bounced_at: new Date().toISOString(),
    },
  });
  return 'suppressed';
}

/**
 * Acts on a permanent rejection, in the transaction that archives the failed
 * message: a hard bounce suppresses the recipient (see `rejectionAction`), a
 * rejection the sender is at fault for is counted on the provider, anything
 * else changes nothing more.
 */
export async function handlePermanentRejection(
  tx: Db,
  workspaceId: string,
  input: {
    provider: { id: string; kind: ProviderKind };
    error: SendError;
    handedOver: boolean;
    to: string;
    message: { id: string; contact_id: string | null };
  },
): Promise<'suppressed' | 'already_suppressed' | 'counted' | 'none'> {
  const action = rejectionAction(input.provider.kind, input.error, input.handedOver);
  if (action === 'count') {
    await repos(tx).providers.recordRejection(workspaceId, input.provider.id, input.error.message);
    return 'counted';
  }
  if (action === 'none') return 'none';
  return suppressBounce(tx, workspaceId, {
    email: input.to,
    reason: 'bounced',
    message: input.message,
    diagnostic: input.error.message,
    actor: { type: 'system', reason: 'hard bounce reported by the receiving server' },
  });
}
