import type { AuditActor, ProviderKind } from '@marlinjai/mail-contract';
import { ApiError } from '../api-error.js';
import { suppressBounce } from '../bounces.js';
import type { Db } from '../db.js';
import { emitEvent } from '../events.js';
import type { MailingRow } from '../repo/mailings.js';
import { repos } from '../repo/index.js';
import type { RunMessage } from '../repo/messages.js';
import type { SuppressionRow } from '../repo/suppressions.js';
import { classifyRejection, rejectionAction, rejectionSignature } from '../transport/rejection.js';
import type { SendError } from '../transport/types.js';

/**
 * The bounce circuit breakers.
 *
 * A hard bounce blocks an address for good, so a false one is costly: when a
 * provider or the sender's setup is broken, a server may refuse every recipient
 * with an address code (5.1.x) although the mailboxes are fine. Two breakers
 * watch for that:
 *
 * - **Per mailing run** (a run starts whenever a mailing enters `sending`:
 *   send, resume, retry-failed). It trips when the last `STREAK` messages of the
 *   run were all refused as dead addresses with the same reply (addresses
 *   stripped), or more than `MAX_SHARE` of the first `WINDOW` were. It undoes
 *   the run's bounce blocks, blocks nothing more in that run, pauses the
 *   mailing with a `pause_reason` and records the anomaly on the provider.
 *   Resuming starts a new run, watched afresh.
 * - **Per provider**, across mailings and test sends: the provider's last
 *   `STREAK` messages within 24 hours all refused with the same reply. This is
 *   what catches one-to-one sends, where no single run is long enough. It
 *   undoes the streak's bounce blocks, pauses the provider's sending mailings,
 *   and opens the provider's breaker: no bounce blocks through the provider, no
 *   test sends, no mailing starts or resumes (`provider_anomaly`) until an
 *   admin clears it (`providers.clearAnomaly`).
 *
 * Undoing a block is exact: a block the bounce created is deleted and reported
 * with `contact.resubscribed` (source `bounce_reverted`); a block the bounce
 * hardened (an unsubscribe) gets its former reason back, silently, since the
 * person is still unsubscribed.
 */
export const BREAKER = { STREAK: 5, WINDOW: 50, MAX_SHARE: 0.2 } as const;

export type BreakerVerdict = { trip: false } | { trip: true; reason: string; sample: string };

const dead = (m: RunMessage) => m.rejection_class === 'recipient';

/** The last `STREAK` messages all refused as dead addresses with the same reply. Pure. */
export function judgeStreak(last: readonly RunMessage[], where: string): BreakerVerdict {
  const tail = last.slice(-BREAKER.STREAK);
  if (tail.length < BREAKER.STREAK || !tail.every(dead)) return { trip: false };
  const signature = tail[0]!.rejection_signature;
  if (signature === null || !tail.every((m) => m.rejection_signature === signature)) return { trip: false };
  return {
    trip: true,
    reason: `${BREAKER.STREAK} recipients in a row ${where} were refused as unknown addresses with the same reply; that points at the provider or the sender's setup, not at the list.`,
    sample: tail[tail.length - 1]!.error ?? signature,
  };
}

/**
 * Judges a mailing run from its first `WINDOW` messages and its last `STREAK`
 * ones (oldest first in both), the current rejection included. Pure.
 */
export function judgeRun(first: readonly RunMessage[], last: readonly RunMessage[]): BreakerVerdict {
  const streak = judgeStreak(last, 'in this mailing');
  if (streak.trip) return streak;
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
 * Undoes bounce blocks the breaker judged false. A block the bounce created is
 * deleted and reported with `contact.resubscribed` (source `bounce_reverted`);
 * one it hardened gets its former reason back, with no event (the person's own
 * block stands). Returns how many blocks were undone.
 */
async function revertBounceBlocks(tx: Db, workspaceId: string, blocks: readonly SuppressionRow[], mailingId: string | null): Promise<number> {
  const r = repos(tx);
  for (const s of blocks) {
    if (s.replaced_reason) {
      await r.suppressions.restoreReplaced(workspaceId, s.id);
      await r.audit.record(workspaceId, {
        action: 'suppression.created',
        actor: ACTOR,
        targetType: 'suppression',
        targetId: s.id,
        details: { reason: s.replaced_reason, topic: null, restored_by: 'bounce circuit breaker', replaced: 'bounced' },
      });
      continue;
    }
    await r.suppressions.delete(workspaceId, s.id);
    await r.audit.record(workspaceId, {
      action: 'suppression.deleted',
      actor: ACTOR,
      targetType: 'suppression',
      targetId: s.id,
      details: { reason: 'bounced', topic: null, reverted_by: 'bounce circuit breaker', mailing_id: mailingId },
    });
    const contact = await r.contacts.byEmail(workspaceId, s.email);
    await emitEvent(tx, workspaceId, {
      type: 'contact.resubscribed',
      data: {
        contact_id: contact?.id ?? null,
        external_id: contact?.external_id ?? null,
        email: s.email,
        topic: null,
        mailing_id: mailingId,
        source: 'bounce_reverted',
        resubscribed_at: new Date().toISOString(),
      },
    });
  }
  return blocks.length;
}

/** What a paused mailing tells its reader when the provider-wide breaker paused it. */
function providerPauseReason(reason: string): string {
  return `Paused by the provider's bounce circuit breaker: ${reason} Bounce blocks from the streak were undone. An admin clears the provider's anomaly, then resumes.`;
}

/** Refuses to start, resume or retry a mailing, or to send a test, while the provider's breaker is open. */
export async function assertProviderOpen(tx: Db, workspaceId: string, providerId: string): Promise<void> {
  const provider = await repos(tx).providers.getForSend(workspaceId, providerId);
  if (provider?.breaker_open_at) {
    throw new ApiError(
      'provider_anomaly',
      "This provider's bounce circuit breaker is open: too many recipients in a row were refused with the same reply, which points at the provider or the sender's setup. Check the provider, then clear its anomaly (providers.clearAnomaly, or the dashboard's provider card).",
      { provider_id: providerId, since: provider.breaker_open_at, reason: provider.anomaly_reason },
    );
  }
}

/** Whether the provider-wide breaker is open, for the worker's claim (which pauses instead of throwing). */
export function providerPauseReasonIfOpen(provider: { breaker_open_at: string | null; anomaly_reason: string | null }): string | null {
  return provider.breaker_open_at ? providerPauseReason(provider.anomaly_reason ?? '') : null;
}

type Rejection = {
  provider: { id: string; kind: ProviderKind };
  error: SendError;
  handedOver: boolean;
  to: string;
  message: { id: string; contact_id: string | null };
  /** The mailing the message belongs to (locked by the caller); null for a test send. */
  mailing: MailingRow | null;
};

export type RejectionOutcome =
  | 'none'
  | 'counted'
  | 'suppressed'
  | 'already_suppressed'
  | 'mailing_breaker_open'
  | 'mailing_breaker_tripped'
  | 'provider_breaker_open'
  | 'provider_breaker_tripped';

/**
 * Acts on a permanent rejection, in the transaction that archived the failed
 * message: records how it was classified, counts the sender's own problems on
 * the provider, and blocks a dead address unless a breaker says the refusals
 * are the provider's fault. Takes the provider's row lock, so a provider's
 * streak is judged one message at a time.
 */
export async function handlePermanentRejection(tx: Db, workspaceId: string, input: Rejection): Promise<RejectionOutcome> {
  const r = repos(tx);
  const { provider, error } = input;
  if (provider.kind === 'smtp' && input.handedOver) {
    await r.messages.setRejection(workspaceId, input.message.id, {
      rejectionClass: classifyRejection(error.code, error.message),
      signature: rejectionSignature(error.message),
    });
  }
  const action = rejectionAction(provider.kind, error, input.handedOver);
  if (action === 'count') {
    await r.providers.recordRejection(workspaceId, provider.id, error.message);
    return 'counted';
  }
  if (action === 'none') return 'none';

  const locked = await r.providers.lock(workspaceId, provider.id);
  if (locked?.breaker_open_at) return 'provider_breaker_open';

  // The narrower breaker first: a streak inside one mailing pauses that mailing
  // only; the provider-wide one catches what no single run shows (one-to-one
  // sends, test sends, streaks spread over mailings).
  if (input.mailing) {
    const inRun = await judgeMailingRun(tx, workspaceId, { ...input, mailing: input.mailing });
    if (inRun !== 'clear') return inRun;
  }

  const recent = await r.messages.recentOfProvider(workspaceId, provider.id, BREAKER.STREAK);
  const streak = judgeStreak(recent, 'through this provider');
  if (streak.trip) {
    const blocks = await r.suppressions.bouncedFromMessages(workspaceId, recent.map((m) => m.id));
    const undone = await revertBounceBlocks(tx, workspaceId, blocks, input.mailing?.id ?? null);
    await r.providers.recordAnomaly(workspaceId, provider.id, {
      scope: 'provider',
      mailingId: input.mailing?.id ?? null,
      reason: streak.reason,
      sample: streak.sample,
    });
    const reason = providerPauseReason(streak.reason);
    const paused = await r.mailings.pauseSendingForProvider(workspaceId, provider.id, reason);
    for (const id of paused) {
      await r.audit.record(workspaceId, { action: 'mailing.paused', actor: ACTOR, targetType: 'mailing', targetId: id, details: { reason: streak.reason } });
    }
    await r.audit.record(workspaceId, {
      action: 'provider.bounces_halted',
      actor: ACTOR,
      targetType: 'provider',
      targetId: provider.id,
      details: { reason: streak.reason, sample: streak.sample.slice(0, 500), reverted_suppressions: undone, paused_mailings: paused.length },
    });
    return 'provider_breaker_tripped';
  }

  return suppressBounce(tx, workspaceId, {
    email: input.to,
    reason: 'bounced',
    message: input.message,
    diagnostic: error.message,
    actor: { type: 'system', reason: 'hard bounce reported by the receiving server' },
  });
}

/**
 * A dead address in a mailing run: `clear` when the run's breaker neither was
 * open nor trips now; otherwise what it did.
 */
async function judgeMailingRun(
  tx: Db,
  workspaceId: string,
  input: { mailing: MailingRow; provider: { id: string } },
): Promise<'clear' | 'mailing_breaker_open' | 'mailing_breaker_tripped'> {
  const r = repos(tx);
  const { mailing } = input;
  const run = mailing.run_started_at;
  if (mailing.breaker_tripped_at && (run === null || Date.parse(mailing.breaker_tripped_at) >= Date.parse(run))) return 'mailing_breaker_open';

  const { first, last } = await r.messages.runOf(workspaceId, mailing.id, run, { first: BREAKER.WINDOW, last: BREAKER.STREAK });
  const verdict = judgeRun(first, last);
  if (!verdict.trip) return 'clear';

  const undone = await revertBounceBlocks(tx, workspaceId, await r.suppressions.bouncedInRun(workspaceId, mailing.id, run), mailing.id);
  const reason = `Paused by the bounce circuit breaker: ${verdict.reason} ${undone} bounce block${undone === 1 ? '' : 's'} from this run ${undone === 1 ? 'was' : 'were'} undone. Check the provider, then resume.`;
  const paused = await r.mailings.tripBreaker(workspaceId, mailing.id, reason);
  await r.providers.recordAnomaly(workspaceId, input.provider.id, { scope: 'mailing', mailingId: mailing.id, reason: verdict.reason, sample: verdict.sample });
  await r.audit.record(workspaceId, {
    action: 'mailing.paused',
    actor: ACTOR,
    targetType: 'mailing',
    targetId: mailing.id,
    details: { reason: verdict.reason, sample: verdict.sample.slice(0, 500), reverted_suppressions: undone, paused },
  });
  return 'mailing_breaker_tripped';
}
