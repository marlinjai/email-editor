import {
  canTransition,
  EDITABLE_MAILING_STATUSES,
  TERMINAL_MAILING_STATUSES,
  type MailingAction,
  type MailingCounts,
  type MailingStatus,
} from '@marlinjai/mail-contract';

export type Tone = 'neutral' | 'gold' | 'ok' | 'warn' | 'danger';

export const MAILING_STATUS_LABEL: Record<MailingStatus, { label: string; tone: Tone }> = {
  draft: { label: 'Draft', tone: 'neutral' },
  scheduled: { label: 'Scheduled', tone: 'neutral' },
  sending: { label: 'Sending', tone: 'gold' },
  paused: { label: 'Paused', tone: 'warn' },
  sent: { label: 'Sent', tone: 'ok' },
  partially_failed: { label: 'Partly failed', tone: 'danger' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
};

/**
 * Which controls a mailing offers, straight from the contract's
 * `MAILING_TRANSITIONS` (the same table the service enforces), plus the
 * dashboard-only ones: editing while still a draft, duplicating once it has
 * left draft.
 */
export function mailingControls(status: MailingStatus) {
  const allowed = (a: MailingAction) => canTransition(status, a);
  return {
    editable: EDITABLE_MAILING_STATUSES.includes(status),
    send: allowed('send'),
    pause: allowed('pause'),
    resume: allowed('resume'),
    cancel: allowed('cancel'),
    retryFailed: allowed('retry-failed'),
    duplicate: status !== 'draft',
    /** The screen keeps asking for fresh counts while the worker can still move them. */
    live: status === 'sending' || status === 'paused' || status === 'scheduled',
    terminal: TERMINAL_MAILING_STATUSES.includes(status),
  };
}

/** How far a mailing has got: settled recipients (sent, failed, skipped) out of all of them. */
export function mailingProgress(counts: MailingCounts): { settled: number; total: number; percent: number } {
  const settled = counts.sent + counts.failed + counts.skipped;
  const percent = counts.total === 0 ? 0 : Math.min(100, Math.round((settled / counts.total) * 100));
  return { settled, total: counts.total, percent };
}
