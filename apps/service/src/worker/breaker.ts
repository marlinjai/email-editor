import type { AuditActor } from '@marlinjai/mail-contract';
import { suppressBounce } from '../bounces.js';
import type { Db } from '../db.js';
import { emitEvent } from '../events.js';
import type { MailingRow } from '../repo/mailings.js';
import { repos } from '../repo/index.js';
import type { RunMessage } from '../repo/messages.js';

/**
 * The bounce circuit breaker.
 *
 * A hard bounce blocks an address for good, so a false one is costly: when a
 * provider or the sender's setup is broken, a server may refuse every recipient
 * with an address code (5.1.x) although the mailboxes are fine. The breaker
 * watches each run of a mailing (a run starts whenever it enters `sending`:
 * send, resume, retry-failed) and trips when
 *
 * - the last `STREAK` messages were all refused as dead addresses with the same
 *   reply (addresses stripped), or
 * - more than `MAX_SHARE` of the first `WINDOW` messages were.
 *
 * Tripping undoes the run's bounce blocks (emitting `contact.resubscribed` with
 * source `bounce_reverted` for each, since a `contact.bounced` went out),
 * blocks nothing more in that run, pauses the mailing with a `pause_reason`,
 * and records the anomaly on the provider for the dashboard. Resuming starts a
 * new run, watched afresh.
 */
export const BREAKER = { STREAK: 5, WINDOW: 50, MAX_SHARE: 0.2 } as const;

export type BreakerVerdict = { trip: false } | { trip: true; reason: string; sample: string };

/**
 * Judges a run from its first `WINDOW` messages and its last `STREAK` ones
 * (oldest first in both), the current rejection included. Pure.
 */
export function judgeRun(first: readonly RunMessage[], last: readonly RunMessage[]): BreakerVerdict {
  const dead = (m: RunMessage) => m.rejection_class === 'recipient';
  const tail = last.slice(-BREAKER.STREAK);
  if (tail.length === BREAKER.STREAK && tail.every(dead)) {
    const signature = tail[0]!.rejection_signature;
    if (signature !== null && tail.every((m) => m.rejection_signature === signature)) {
      return {
        trip: true,
        reason: `${BREAKER.STREAK} recipients in a row were refused as unknown addresses with the same reply; that points at the provider or the sender's setup, not at the list.`,
        sample: tail[tail.length - 1]!.error ?? signature,
      };
    }
  }
  const window = first.slice(0, BREAKER.WINDOW);
  const refused = window.filter(dead);
  if (refused.length > Math.floor(BREAKER.WINDOW * BREAKER.MAX_SHARE)) {
    return {
      trip: true,
      reason: `More than ${Math.round(BREAKER.MAX_SHARE * 100)} percent of the first ${BREAKER.WINDOW} recipients were refused as unknown addresses (${refused.length} so far); that points at the provider or the sender's setup, not at the list.`,
      sample: refused[refused.length - 1]!.error ?? refused[refused.length - 1]!.rejection_signature ?? '',
    };
  }
  return { trip: false };
}

const ACTOR: AuditActor = { type: 'system', reason: 'bounce circuit breaker' };

/**
 * A recipient refused as a dead address, inside the worker's transaction that
 * archived the message (the mailing row is locked, so runs of one mailing are
 * judged one message at a time). Blocks the address unless the breaker has
 * tripped in this run or trips now.
 */
export async function onDeadAddress(
  tx: Db,
  workspaceId: string,
  input: {
    mailing: MailingRow;
    providerId: string;
    to: string;
    message: { id: string; contact_id: string | null };
    diagnostic: string;
  },
): Promise<'suppressed' | 'already_suppressed' | 'breaker_open' | 'breaker_tripped'> {
  const r = repos(tx);
  const { mailing } = input;
  const run = mailing.run_started_at;
  if (mailing.breaker_tripped_at && (run === null || Date.parse(mailing.breaker_tripped_at) >= Date.parse(run))) return 'breaker_open';

  const { first, last } = await r.messages.runOf(workspaceId, mailing.id, run, { first: BREAKER.WINDOW, last: BREAKER.STREAK });
  const verdict = judgeRun(first, last);
  if (!verdict.trip) {
    return suppressBounce(tx, workspaceId, {
      email: input.to,
      reason: 'bounced',
      message: input.message,
      diagnostic: input.diagnostic,
      actor: { type: 'system', reason: 'hard bounce reported by the receiving server' },
    });
  }

  // Trip: undo this run's bounce blocks, pause, and say why.
  const reverted = await r.suppressions.bouncedInRun(workspaceId, mailing.id, run);
  for (const s of reverted) {
    await r.suppressions.delete(workspaceId, s.id);
    await r.audit.record(workspaceId, {
      action: 'suppression.deleted',
      actor: ACTOR,
      targetType: 'suppression',
      targetId: s.id,
      details: { reason: 'bounced', topic: null, reverted_by: 'bounce circuit breaker', mailing_id: mailing.id },
    });
    const contact = await r.contacts.byEmail(workspaceId, s.email);
    await emitEvent(tx, workspaceId, {
      type: 'contact.resubscribed',
      data: {
        contact_id: contact?.id ?? null,
        external_id: contact?.external_id ?? null,
        email: s.email,
        topic: null,
        mailing_id: mailing.id,
        source: 'bounce_reverted',
        resubscribed_at: new Date().toISOString(),
      },
    });
  }
  const reason = `Paused by the bounce circuit breaker: ${verdict.reason} ${reverted.length} bounce block${reverted.length === 1 ? '' : 's'} from this run ${reverted.length === 1 ? 'was' : 'were'} undone. Check the provider, then resume.`;
  const paused = await r.mailings.tripBreaker(workspaceId, mailing.id, reason);
  await r.providers.recordAnomaly(workspaceId, input.providerId, { mailingId: mailing.id, reason: verdict.reason, sample: verdict.sample });
  await r.audit.record(workspaceId, {
    action: 'mailing.paused',
    actor: ACTOR,
    targetType: 'mailing',
    targetId: mailing.id,
    details: { reason: verdict.reason, sample: verdict.sample.slice(0, 500), reverted_suppressions: reverted.length, paused },
  });
  return 'breaker_tripped';
}
