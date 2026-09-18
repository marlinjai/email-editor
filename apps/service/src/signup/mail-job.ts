import { ledgerBudget, type Budget } from '../budget.js';
import type { Db, Sql } from '../db.js';
import { isPageLocale, type PageLocale } from '../pages/i18n.js';
import { renderConfirmationMail } from '../pages/signup-render.js';
import type { PlatformJob } from '../platform/worker.js';
import type { RootKeys } from '../platform/tokens.js';
import { repos } from '../repo/index.js';
import type { ProviderForSend } from '../repo/providers.js';
import type { SignupFormRow, SignupSubmissionRow } from '../repo/signup.js';
import { OutcomeUnknownSendError, PermanentSendError, SendError, TransientSendError } from '../transport/index.js';
import type { OutgoingMessage } from '../transport/types.js';
import { mergeHtml } from '../worker/merge.js';
import type { TransportFor } from '../worker/transports.js';
import { createSignupService } from './service.js';

export const DEFAULT_CONFIRMATION_RETRY_DELAYS_MS = [30_000, 120_000, 600_000] as const;

/** Every C0 control character and DEL: a line break in a subject would start a new header. */
const CONTROL = new RegExp('[\\u0000-\\u001f\\u007f]+', 'g');

export type ConfirmationMailOptions = {
  sql: Sql;
  transportFor: TransportFor;
  rootKeys: RootKeys;
  publicBaseUrl: string;
  budget?: Budget;
  retryDelaysMs?: readonly number[];
  sendTimeoutMs?: number;
  /** A mail still `sending` after this long was taken by a worker that died. */
  stuckAfterMs?: number;
  /** How often the stuck scan and the purge run. */
  housekeepingEveryMs?: number;
  /** Submissions that can no longer change are deleted after this long. */
  purgeAfterMs?: number;
  log?: Pick<Console, 'error' | 'log'>;
};

type Claimed = { submission: SignupSubmissionRow; form: SignupFormRow; provider: ProviderForSend; workspaceName: string; reservationId: string };

/**
 * Sends the double opt-in confirmation mails from the `signup_submissions`
 * outbox, one per tick, as a platform job.
 *
 * Like the send worker: one transaction claims the mail (`SKIP LOCKED`),
 * checks it is still wanted (not superseded, confirmed, expired, or its form
 * deleted), waits out the provider's `min_interval_ms` and reserves one
 * recipient of its daily budget, then commits the claim; the mail is sent
 * outside any transaction; the archived message and the outcome commit
 * together. Transient failures retry with backoff; permanent ones end `failed`
 * with the provider's reason. A confirmation mail is transactional: it carries
 * no List-Unsubscribe and emits no `message.*` webhook event, but it is archived
 * in `messages` and counts against the budget like every send.
 *
 * A mail left `sending` by a worker that died is sent again: a second
 * confirmation mail is harmless, a lost one leaves the person unable to confirm.
 */
export function signupConfirmationJob(options: ConfirmationMailOptions): PlatformJob {
  const { sql } = options;
  const budget = options.budget ?? ledgerBudget;
  const retryDelays = options.retryDelaysMs ?? DEFAULT_CONFIRMATION_RETRY_DELAYS_MS;
  const sendTimeoutMs = options.sendTimeoutMs ?? 60_000;
  const stuckAfterMs = options.stuckAfterMs ?? 15 * 60_000;
  const housekeepingEveryMs = options.housekeepingEveryMs ?? 60_000;
  const purgeAfterMs = options.purgeAfterMs ?? 30 * 24 * 60 * 60 * 1000;
  const log = options.log ?? console;
  const base = options.publicBaseUrl.replace(/\/+$/, '');
  const tokens = createSignupService({ sql, keys: options.rootKeys });
  let lastHousekeeping = 0;

  async function housekeeping(now: Date): Promise<boolean> {
    if (now.getTime() - lastHousekeeping < housekeepingEveryMs) return false;
    lastHousekeeping = now.getTime();
    const r = repos(sql);
    let worked = false;
    for (const s of await r.signup.listStuckMailForWorker(new Date(now.getTime() - stuckAfterMs), 100)) {
      if (await r.signup.setMail(s.workspace_id, s.id, ['sending'], { status: 'pending', retryInMs: 0, error: 'the worker stopped while sending; sent again' })) {
        worked = true;
      }
    }
    const purged = await r.signup.purgeForWorker(purgeAfterMs);
    if (purged > 0) log.log(`[signup] purged ${purged} finished submissions and rate-limit windows`);
    return worked;
  }

  async function claim(tx: Db, now: Date): Promise<Claimed | 'worked' | 'none'> {
    const r = repos(tx);
    const submission = await r.signup.claimDueMailForWorker();
    if (!submission) return 'none';
    const ws = submission.workspace_id;
    const skip = async (error: string) => {
      await r.signup.setMail(ws, submission.id, ['pending'], { status: 'skipped', error });
      return 'worked' as const;
    };
    if (submission.superseded_at) return skip('superseded by a newer signup of the same address');
    if (submission.confirmed_at) return skip('confirmed before the mail went out');
    if (new Date(submission.expires_at).getTime() <= now.getTime()) return skip('the link expired before the mail went out');
    const form = await r.signup.getFormAnyState(ws, submission.form_id);
    if (!form || form.deleted_at) return skip('the signup form was deleted');
    const workspace = await r.workspaces.get(ws);
    if (!workspace) return skip('the workspace is gone');
    if (!(await r.providers.get(ws, form.provider_id))) {
      await r.signup.setMail(ws, submission.id, ['pending'], {
        status: 'failed',
        error: "the form's provider was deleted; choose another provider for the form",
      });
      return 'worked';
    }

    const provider = (await r.providers.lock(ws, form.provider_id))!;
    if (provider.min_interval_ms > 0) {
      const last = await r.providerSends.lastSentAt(ws, provider.id);
      if (last) {
        const [{ now }] = (await tx`SELECT clock_timestamp() AS now`) as unknown as [{ now: string }];
        const left = new Date(last).getTime() + provider.min_interval_ms - new Date(now).getTime();
        if (left > 0) {
          await r.signup.setMail(ws, submission.id, ['pending'], { status: 'pending', retryInMs: left });
          return 'none';
        }
      }
    }
    const reservation = await budget.reserve(tx, ws, provider.id, 1);
    if (!reservation.ok) {
      const waitMs = reservation.reason === 'exhausted' ? Math.max(1_000, reservation.retryAfter.getTime() - Date.now()) : 3_600_000;
      await r.signup.setMail(ws, submission.id, ['pending'], {
        status: 'pending',
        retryInMs: waitMs,
        error: "the provider's daily budget is used up; waiting",
      });
      return 'none';
    }
    await r.signup.setMail(ws, submission.id, ['pending'], { status: 'sending' });
    return {
      submission: { ...submission, mail_attempts: submission.mail_attempts + 1 },
      form,
      provider: (await r.providers.getForSend(ws, provider.id))!,
      workspaceName: workspace.name,
      reservationId: reservation.reservationId,
    };
  }

  function compose(c: Claimed): OutgoingMessage {
    const { submission, form, provider } = c;
    const locale: PageLocale = isPageLocale(submission.locale) ? submission.locale : 'en';
    const confirmUrl = `${base}/f/confirm/${tokens.confirmToken(submission)}`;
    const builtIn = renderConfirmationMail({ locale, workspaceName: c.workspaceName, confirmUrl });
    const html = form.confirmation_html
      ? mergeHtml(form.confirmation_html, {
          email: submission.email,
          merge: { confirm_url: confirmUrl, first_name: submission.first_name, last_name: submission.last_name },
          contact: null,
          unsubscribeUrl: '',
        })
      : builtIn.html;
    return {
      from: { name: provider.from_name, email: provider.from_email },
      to: [submission.email],
      replyTo: provider.reply_to,
      subject: builtIn.subject.replace(CONTROL, ' ').trim(),
      html,
      ...(form.confirmation_html ? {} : { text: builtIn.text }),
      headers: { 'Auto-Submitted': 'auto-generated' },
    };
  }

  async function record(c: Claimed, message: OutgoingMessage, outcome: { ok: true; id: string | null } | { ok: false; error: SendError; handedOver: boolean }) {
    const ws = c.submission.workspace_id;
    await sql.begin(async (tx) => {
      const r = repos(tx);
      const contact = await r.contacts.byEmail(ws, c.submission.email);
      const archive = {
        mailingId: null,
        recipientId: null,
        contactId: contact?.id ?? null,
        to: c.submission.email,
        subject: message.subject,
        html: message.html,
        providerId: c.provider.id,
        isTest: false,
        recipientCount: 1,
      };
      if (outcome.ok) {
        const row = await r.messages.insert(ws, { ...archive, providerMessageId: outcome.id, outcome: 'sent', error: null });
        await r.signup.setMail(ws, c.submission.id, ['sending'], { status: 'sent', messageId: row.id });
        return;
      }
      const { error } = outcome;
      const attempts = c.submission.mail_attempts;
      if (error instanceof TransientSendError && attempts <= retryDelays.length) {
        await budget.release(tx, ws, c.reservationId);
        await r.signup.setMail(ws, c.submission.id, ['sending'], {
          status: 'pending',
          retryInMs: retryDelays[attempts - 1]!,
          error: error.message,
        });
        return;
      }
      if (error instanceof TransientSendError || error instanceof PermanentSendError) {
        if (error instanceof TransientSendError || !outcome.handedOver) await budget.release(tx, ws, c.reservationId);
        const text = error instanceof TransientSendError ? `${error.message} (after ${attempts} attempts)` : error.message;
        const row = await r.messages.insert(ws, { ...archive, providerMessageId: null, outcome: 'failed', error: text });
        await r.signup.setMail(ws, c.submission.id, ['sending'], { status: 'failed', error: text, messageId: row.id });
        return;
      }
      // The outcome is unknown: the provider may have taken it. Keep the budget spent and do not repeat it.
      await r.signup.setMail(ws, c.submission.id, ['sending'], {
        status: 'failed',
        error: `whether the provider took the confirmation mail is unknown: ${error.message}`,
      });
    });
  }

  return {
    name: 'signup confirmation mails',
    async tick(now: Date): Promise<boolean> {
      const housekept = await housekeeping(now);
      const claimed = (await sql.begin((tx) => claim(tx, now))) as Claimed | 'worked' | 'none';
      if (claimed === 'none') return housekept;
      if (claimed === 'worked') return true;
      const message = compose(claimed);
      let outcome: { ok: true; id: string | null } | { ok: false; error: SendError; handedOver: boolean };
      try {
        const transport = options.transportFor(claimed.provider);
        try {
          outcome = { ok: true, id: (await withTimeout(transport.send(message), sendTimeoutMs)).messageId };
        } catch (err) {
          outcome = { ok: false, error: asSendError(err), handedOver: true };
        }
      } catch (err) {
        outcome = {
          ok: false,
          error: err instanceof SendError ? err : new PermanentSendError(err instanceof Error ? err.message : String(err)),
          handedOver: false,
        };
      }
      await record(claimed, message, outcome);
      if (!outcome.ok) log.error(`[signup] confirmation mail of submission ${claimed.submission.id} failed: ${outcome.error.message}`);
      return true;
    },
  };
}

function asSendError(err: unknown): SendError {
  if (err instanceof SendError) return err;
  return new OutcomeUnknownSendError(`the send broke off: ${err instanceof Error ? err.message : String(err)}`);
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new OutcomeUnknownSendError(`no answer from the provider within ${ms} ms`)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}
