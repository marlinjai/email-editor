import type { Db } from '../db.js';
import { emitEvent } from '../events.js';
import { repos } from '../repo/index.js';
import type { MailingRow } from '../repo/mailings.js';
import type { MessageRow } from '../repo/messages.js';

/**
 * What the worker and the test send write once a message's fate is known. Each
 * function runs inside the caller's transaction, so the archived message, the
 * recipient's status and the webhook event commit together or not at all.
 */

type MessageEventContext = {
  mailing: Pick<MailingRow, 'id' | 'metadata' | 'topic'>;
  externalId: string | null;
};

/** Archives a message the provider accepted and emits `message.sent`. */
export async function recordSent(
  tx: Db,
  workspaceId: string,
  input: Parameters<ReturnType<typeof repos>['messages']['insert']>[1] & { outcome: 'sent' },
  ctx: MessageEventContext,
): Promise<MessageRow> {
  const message = await repos(tx).messages.insert(workspaceId, input);
  await emitEvent(tx, workspaceId, {
    type: 'message.sent',
    data: { ...eventBase(message, ctx), html: message.html, sent_at: message.created_at },
  });
  return message;
}

/**
 * Archives a message the provider refused and emits `message.failed`.
 * `retryable` is false for a permanent rejection, true when only the retries ran
 * out (a later retry-failed may still get it through).
 */
export async function recordFailed(
  tx: Db,
  workspaceId: string,
  input: Parameters<ReturnType<typeof repos>['messages']['insert']>[1] & { outcome: 'failed'; error: string },
  ctx: MessageEventContext & { retryable: boolean },
): Promise<MessageRow> {
  const message = await repos(tx).messages.insert(workspaceId, input);
  await emitEvent(tx, workspaceId, {
    type: 'message.failed',
    data: { ...eventBase(message, ctx), error: input.error, retryable: ctx.retryable, failed_at: message.created_at },
  });
  return message;
}

function eventBase(message: MessageRow, ctx: MessageEventContext) {
  return {
    message_id: message.id,
    mailing_id: message.mailing_id,
    mailing_metadata: ctx.mailing.metadata,
    recipient_id: message.recipient_id,
    contact_id: message.contact_id,
    external_id: ctx.externalId,
    email: message.to,
    subject: message.subject,
    topic: ctx.mailing.topic,
    provider_message_id: message.provider_message_id,
    is_test: message.is_test,
  };
}

/**
 * Ends a `sending` mailing whose queue has drained: `sent` when every recipient
 * was sent or skipped for a policy reason, `partially_failed` when at least one
 * failed or ended `outcome_unknown`. The caller holds the mailing's row lock, so
 * two workers settling the last two recipients cannot both miss (or both take)
 * the end; the compare-and-set on `sending` makes `mailing.finished` fire exactly
 * once per run. Returns the new status, or null when the mailing is not done.
 */
export async function finishIfDrained(tx: Db, workspaceId: string, mailingId: string) {
  const r = repos(tx);
  const counts = await r.mailings.counts(workspaceId, mailingId);
  if (counts.queued > 0 || counts.sending > 0) return null;
  const unknown = await r.recipients.list(workspaceId, mailingId, { limit: 1, status: 'skipped', skipReason: 'outcome_unknown' });
  const status = counts.failed > 0 || unknown.length > 0 ? 'partially_failed' : 'sent';
  const done = await r.mailings.transition(workspaceId, mailingId, ['sending'], status, { finishedAt: true });
  if (!done) return null;
  await emitEvent(tx, workspaceId, {
    type: 'mailing.finished',
    data: { mailing_id: mailingId, mailing_metadata: done.metadata, status, counts, finished_at: done.finished_at! },
  });
  return status;
}
