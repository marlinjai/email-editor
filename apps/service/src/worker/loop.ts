import { ledgerBudget, type Budget } from '../budget.js';
import type { Db, Sql } from '../db.js';
import { repos } from '../repo/index.js';
import type { ContactWithTopics } from '../repo/contacts.js';
import type { MailingRow } from '../repo/mailings.js';
import type { ProviderForSend } from '../repo/providers.js';
import type { RecipientRow } from '../repo/recipients.js';
import { OutcomeUnknownSendError, PermanentSendError, SendError, TransientSendError } from '../transport/index.js';
import type { UnsubscribeSigner } from '../unsubscribe.js';
import { composeMessage } from './compose.js';
import { DEFAULT_PUBLIC_BASE_URL, unsubscribeUrl } from './merge.js';
import { finishIfDrained, recordFailed, recordSent } from './settle.js';
import type { TransportFor } from './transports.js';

export type SendWorkerOptions = {
  sql: Sql;
  transportFor: TransportFor;
  signer: UnsubscribeSigner;
  budget?: Budget;
  /** Base of the hosted unsubscribe page; https://mail.lumitra.co by default. */
  publicBaseUrl?: string;
  log?: Pick<Console, 'error' | 'log'>;
  /** Idle wait between scans when nothing is due. */
  pollMs?: number;
  /** Waits before retry 1, 2, 3 after a transient failure; its length is the number of retries. */
  retryDelaysMs?: readonly number[];
  /** Longest a single send may take before its outcome counts as unknown. */
  sendTimeoutMs?: number;
  /**
   * A recipient still `sending` after this long was claimed by a worker that
   * died mid-send. Longer than any send can take, so a live worker on another
   * instance is never mistaken for a dead one.
   */
  stuckAfterMs?: number;
  /** How often the loop looks for such rows (it also does at start). */
  reconcileEveryMs?: number;
};

/** The three retries of the plan, with backoff. */
export const DEFAULT_RETRY_DELAYS_MS = [30_000, 120_000, 600_000] as const;

/** Unwinds a claim transaction without writing anything: the recipient stays queued, nothing is counted. */
class Wait extends Error {
  constructor(
    readonly providerId: string,
    readonly until: Date,
  ) {
    super('wait');
  }
}

type Claimed = {
  mailing: MailingRow;
  html: string;
  recipient: RecipientRow;
  contact: ContactWithTopics;
  provider: ProviderForSend;
  reservationId: string;
};

type Step = { kind: 'claimed'; claimed: Claimed } | { kind: 'skipped' } | { kind: 'none' } | { kind: 'empty' } | { kind: 'wait'; wait: Wait };

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve) => {
    if (signal?.aborted) return resolve();
    const timer = setTimeout(done, Math.max(0, ms));
    function done() {
      clearTimeout(timer);
      signal?.removeEventListener('abort', done);
      resolve();
    }
    signal?.addEventListener('abort', done, { once: true });
  });

/**
 * The send worker: one loop per process, over every workspace.
 *
 * One cycle, per `sending` mailing, is one transaction that claims the next due
 * recipient (`FOR UPDATE SKIP LOCKED`), checks at that moment that the address is
 * not suppressed (for every topic or this one), that the contact still exists and
 * is still subscribed to the topic (a skip is recorded with its reason), then
 * waits out the provider's `min_interval_ms` and reserves one recipient of its
 * daily budget. The interval and the budget are read under the provider's row
 * lock, so they hold across every worker of every instance. When either says
 * "not yet", the whole transaction rolls back: the recipient stays `queued`, no
 * attempt is counted, and this provider's mailings rest until the given time.
 *
 * The claim commits before the message is handed over. Then the message is sent
 * outside any transaction, and its archive row, the recipient's final status and
 * the webhook event commit together. A worker that dies in between leaves the row
 * `sending`, which `reconcile` settles from the archive: a message row means it
 * was sent, none means `outcome_unknown`, never retried by itself (a duplicate
 * cannot be unsent).
 *
 * Pause and cancel are read under the mailing's lock at every claim, so they take
 * effect between two sends; the send in flight completes. `stop()` lets it.
 */
export class SendWorker {
  private readonly sql: Sql;
  private readonly budget: Budget;
  private readonly publicBaseUrl: string;
  private readonly log: Pick<Console, 'error' | 'log'>;
  private readonly pollMs: number;
  private readonly retryDelaysMs: readonly number[];
  private readonly sendTimeoutMs: number;
  private readonly stuckAfterMs: number;
  private readonly reconcileEveryMs: number;
  /** Provider id to the time its interval or budget frees up. */
  private readonly blocked = new Map<string, Date>();
  /** Mailing id to its provider id, learnt at the first claim, to skip blocked providers cheaply. */
  private readonly providerOf = new Map<string, string>();
  private stopping = false;
  private wake = new AbortController();
  private running: Promise<void> | null = null;
  private lastReconcile = 0;

  constructor(private readonly options: SendWorkerOptions) {
    this.sql = options.sql;
    this.budget = options.budget ?? ledgerBudget;
    this.publicBaseUrl = options.publicBaseUrl ?? DEFAULT_PUBLIC_BASE_URL;
    this.log = options.log ?? console;
    this.pollMs = options.pollMs ?? 1_000;
    this.retryDelaysMs = options.retryDelaysMs ?? DEFAULT_RETRY_DELAYS_MS;
    this.sendTimeoutMs = options.sendTimeoutMs ?? 120_000;
    this.stuckAfterMs = options.stuckAfterMs ?? 15 * 60_000;
    this.reconcileEveryMs = options.reconcileEveryMs ?? 60_000;
    if (this.stuckAfterMs <= this.sendTimeoutMs) {
      throw new RangeError('stuckAfterMs must be longer than sendTimeoutMs, or a live send could be reconciled');
    }
  }

  /** Starts the loop. Reconciles what a previous process left behind first. */
  start(): void {
    if (this.running) return;
    this.stopping = false;
    this.running = this.loop().catch((err) => this.log.error('[worker] loop stopped by an unexpected error:', err));
  }

  /** Finishes the send in flight, starts no other, and resolves once the loop has exited. */
  async stop(): Promise<void> {
    this.stopping = true;
    this.wake.abort();
    await this.running;
    this.running = null;
  }

  private async loop(): Promise<void> {
    while (!this.stopping) {
      try {
        if (Date.now() - this.lastReconcile >= this.reconcileEveryMs) {
          this.lastReconcile = Date.now();
          await this.reconcile();
        }
        const pass = await this.runOnce();
        if (pass.worked) continue;
        const wait = pass.nextWakeAt ? Math.min(this.pollMs, pass.nextWakeAt.getTime() - Date.now()) : this.pollMs;
        await sleep(wait, this.wake.signal);
      } catch (err) {
        // The database went away or a bug: log it and keep the loop alive.
        this.log.error('[worker] cycle failed:', err);
        await sleep(this.pollMs, this.wake.signal);
      }
      if (this.wake.signal.aborted && !this.stopping) this.wake = new AbortController();
    }
  }

  /**
   * Runs cycles until nothing is due. With `waitUpToMs`, also waits for a
   * provider interval or budget that frees up within that long of now. For tests and
   * for a one-shot drain; the running loop does the same forever.
   */
  async drain(options: { waitUpToMs?: number } = {}): Promise<void> {
    const most = options.waitUpToMs ?? 0;
    for (;;) {
      const pass = await this.runOnce();
      if (pass.worked) continue;
      if (!pass.nextWakeAt || pass.nextWakeAt.getTime() - Date.now() > most) return;
      await sleep(pass.nextWakeAt.getTime() - Date.now() + 5);
    }
  }

  /** One cycle over every sending mailing. */
  async runOnce(): Promise<{ worked: boolean; nextWakeAt: Date | null }> {
    const now = Date.now();
    for (const [provider, until] of this.blocked) if (until.getTime() <= now) this.blocked.delete(provider);
    let worked = false;
    const mailings = await repos(this.sql).mailings.listSendingForWorker(100);
    for (const m of mailings) {
      if (this.stopping) break;
      const provider = this.providerOf.get(m.id);
      if (provider && this.blocked.has(provider)) continue;
      if (await this.step(m.workspace_id, m.id)) worked = true;
    }
    let nextWakeAt: Date | null = null;
    for (const until of this.blocked.values()) if (!nextWakeAt || until < nextWakeAt) nextWakeAt = until;
    return { worked, nextWakeAt };
  }

  /** Claims and sends at most one recipient of one mailing. Returns whether anything changed. */
  private async step(workspaceId: string, mailingId: string): Promise<boolean> {
    let step: Step;
    try {
      step = (await this.sql.begin((tx) => this.claim(tx, workspaceId, mailingId))) as Step;
    } catch (err) {
      if (!(err instanceof Wait)) throw err;
      step = { kind: 'wait', wait: err };
    }
    switch (step.kind) {
      case 'wait':
        this.blocked.set(step.wait.providerId, step.wait.until);
        return false;
      case 'none':
        return false;
      case 'skipped':
        return true;
      case 'empty':
        return (await this.sql.begin(async (tx) => {
          if (!(await repos(tx).mailings.lock(workspaceId, mailingId))) return false;
          return (await finishIfDrained(tx, workspaceId, mailingId)) !== null;
        })) as boolean;
      case 'claimed':
        await this.deliver(workspaceId, step.claimed);
        return true;
    }
  }

  private async claim(tx: Db, workspaceId: string, mailingId: string): Promise<Step> {
    const r = repos(tx);
    const mailing = await r.mailings.lock(workspaceId, mailingId);
    if (!mailing || mailing.status !== 'sending') return { kind: 'none' };
    this.providerOf.set(mailingId, mailing.provider_id);
    const recipient = await r.recipients.claimNext(workspaceId, mailingId);
    if (!recipient) return { kind: 'empty' };

    const skip = async (reason: 'suppressed' | 'not_subscribed' | 'contact_erased', error?: string) => {
      await r.recipients.settle(workspaceId, recipient.id, ['sending'], { status: 'skipped', reason, error });
      await finishIfDrained(tx, workspaceId, mailingId);
      return { kind: 'skipped' } as const;
    };
    const contact = recipient.contact_id ? await r.contacts.get(workspaceId, recipient.contact_id) : null;
    if (!contact) return skip('contact_erased');
    const block = await r.suppressions.findBlocking(workspaceId, recipient.email, mailing.topic_id);
    if (block) return skip('suppressed', `blocked (${block.reason}${block.topic ? `, topic ${block.topic}` : ', every topic'})`);
    if (!(await r.contacts.isSubscribed(workspaceId, contact.id, mailing.topic_id))) return skip('not_subscribed');

    const provider = await r.providers.lock(workspaceId, mailing.provider_id);
    if (!provider) throw new Error(`mailing ${mailingId} names provider ${mailing.provider_id}, which does not exist`);
    if (provider.min_interval_ms > 0) {
      const last = await r.providerSends.lastSentAt(workspaceId, provider.id);
      if (last) {
        // Measured on the database's clock, which stamped the ledger, so workers
        // on hosts whose clocks disagree still keep the interval.
        const [{ now }] = (await tx`SELECT clock_timestamp() AS now`) as unknown as [{ now: string }];
        const left = new Date(last).getTime() + provider.min_interval_ms - new Date(now).getTime();
        if (left > 0) throw new Wait(provider.id, new Date(Date.now() + left));
      }
    }
    const reservation = await this.budget.reserve(tx, workspaceId, provider.id, 1);
    if (!reservation.ok) {
      // `exceeds_budget` cannot happen for one recipient (the budget is at least 1).
      const until = reservation.reason === 'exhausted' ? reservation.retryAfter : new Date(Date.now() + 3_600_000);
      throw new Wait(provider.id, until);
    }
    const forSend = (await r.providers.getForSend(workspaceId, provider.id))!;
    const compiled = await r.mailings.compiled(workspaceId, mailingId);
    if (!compiled?.html) throw new Error(`mailing ${mailingId} is sending without compiled HTML`);
    return {
      kind: 'claimed',
      claimed: { mailing, html: compiled.html, recipient, contact, provider: forSend, reservationId: reservation.reservationId },
    };
  }

  private async deliver(workspaceId: string, c: Claimed): Promise<void> {
    const { mailing, recipient, contact, provider } = c;
    const token = this.options.signer.sign({
      workspace_id: workspaceId,
      contact_id: contact.id,
      mailing_id: mailing.id,
      topic_id: mailing.topic_id,
      // Fixed per recipient, so a retry is byte-identical (Resend deduplicates on it).
      iat: Math.floor(new Date(recipient.created_at).getTime() / 1000),
    });
    const message = composeMessage({
      provider,
      subject: mailing.subject,
      preheader: mailing.preheader,
      html: c.html,
      to: recipient.email,
      ctx: {
        email: recipient.email,
        merge: recipient.merge,
        contact: { first_name: contact.first_name, last_name: contact.last_name, properties: contact.properties },
        unsubscribeUrl: unsubscribeUrl(this.publicBaseUrl, token),
      },
    });

    let outcome: { ok: true; providerMessageId: string | null } | { ok: false; error: SendError; handedOver: boolean };
    try {
      const transport = this.options.transportFor(provider);
      try {
        const result = await withTimeout(transport.send(message), this.sendTimeoutMs);
        outcome = { ok: true, providerMessageId: result.messageId };
      } catch (err) {
        outcome = { ok: false, error: asSendError(err), handedOver: true };
      }
    } catch (err) {
      // No transport could be built (no credential, a sealing key missing): nothing was handed over.
      outcome = { ok: false, error: err instanceof SendError ? err : new PermanentSendError(errorText(err)), handedOver: false };
    }

    const eventCtx = { mailing, externalId: contact.external_id };
    const archive = {
      mailingId: mailing.id,
      recipientId: recipient.id,
      contactId: contact.id,
      to: recipient.email,
      subject: message.subject,
      html: message.html,
      providerId: provider.id,
      isTest: false,
      recipientCount: message.to.length,
    };

    await this.sql.begin(async (tx) => {
      const r = repos(tx);
      await r.mailings.lock(workspaceId, mailing.id);
      if (outcome.ok) {
        const row = await recordSent(tx, workspaceId, { ...archive, outcome: 'sent', error: null, providerMessageId: outcome.providerMessageId }, eventCtx);
        await this.settle(tx, workspaceId, recipient.id, { status: 'sent', messageId: row.id });
      } else if (outcome.error instanceof TransientSendError && recipient.attempts <= this.retryDelaysMs.length) {
        // Not taken: give the budget back and try again later.
        await this.budget.release(tx, workspaceId, c.reservationId);
        const delay = this.retryDelaysMs[recipient.attempts - 1]!;
        await this.settle(tx, workspaceId, recipient.id, {
          status: 'queued',
          retryInMs: delay,
          error: outcome.error.message,
        });
      } else if (outcome.error instanceof TransientSendError || outcome.error instanceof PermanentSendError) {
        if (!outcome.handedOver || outcome.error instanceof TransientSendError) {
          await this.budget.release(tx, workspaceId, c.reservationId);
        }
        const retryable = outcome.error instanceof TransientSendError;
        const error = retryable ? `${outcome.error.message} (after ${recipient.attempts} attempts)` : outcome.error.message;
        const row = await recordFailed(tx, workspaceId, { ...archive, outcome: 'failed', error, providerMessageId: null }, { ...eventCtx, retryable });
        await this.settle(tx, workspaceId, recipient.id, { status: 'failed', messageId: row.id, error });
      } else {
        // Unknown outcome: it may have been delivered. Keep the budget spent, never retry.
        await this.settle(tx, workspaceId, recipient.id, {
          status: 'skipped',
          reason: 'outcome_unknown',
          error: outcome.error.message,
        });
      }
      await finishIfDrained(tx, workspaceId, mailing.id);
    });
  }

  private async settle(tx: Db, workspaceId: string, recipientId: string, to: Parameters<ReturnType<typeof repos>['recipients']['settle']>[3]) {
    const row = await repos(tx).recipients.settle(workspaceId, recipientId, ['sending'], to);
    if (!row) throw new Error(`recipient ${recipientId} left 'sending' while its message was out; nothing recorded`);
  }

  /**
   * Settles recipients a dead worker left `sending`. A message archived for the
   * current claim decides it; without one the outcome is unknown. Returns how
   * many rows it settled.
   */
  async reconcile(): Promise<number> {
    const stuck = await repos(this.sql).recipients.listStuckForWorker(new Date(Date.now() - this.stuckAfterMs), 100);
    let settled = 0;
    for (const s of stuck) {
      const done = await this.sql.begin(async (tx) => {
        const r = repos(tx);
        await r.mailings.lock(s.workspace_id, s.mailing_id);
        const recipient = await r.recipients.get(s.workspace_id, s.id);
        if (!recipient || recipient.status !== 'sending') return false;
        const message = await r.messages.latestForRecipient(s.workspace_id, s.id);
        const current = message && recipient.claimed_at && message.created_at >= recipient.claimed_at ? message : null;
        const to = current
          ? current.outcome === 'sent'
            ? ({ status: 'sent', messageId: current.id } as const)
            : ({ status: 'failed', messageId: current.id, error: current.error ?? 'failed' } as const)
          : ({
              status: 'skipped',
              reason: 'outcome_unknown',
              error: 'The worker stopped while sending; whether the provider accepted the message is unknown.',
            } as const);
        if (!(await r.recipients.settle(s.workspace_id, s.id, ['sending'], to))) return false;
        await finishIfDrained(tx, s.workspace_id, s.mailing_id);
        return true;
      });
      if (done) settled++;
    }
    if (settled > 0) this.log.log(`[worker] reconciled ${settled} recipients left mid-send`);
    return settled;
  }
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** A rejection that is not one of the Transport contract's errors is a crash: the outcome is unknown. */
function asSendError(err: unknown): SendError {
  if (err instanceof SendError) return err;
  return new OutcomeUnknownSendError(`the send broke off: ${errorText(err)}`);
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
