import { randomUUID } from 'node:crypto';
import type { MailingTestResult } from '@marlinjai/mail-contract';
import { ApiError } from '../api-error.js';
import { ledgerBudget, type Budget } from '../budget.js';
import type { Sql } from '../db.js';
import { repos } from '../repo/index.js';
import type { MailingRow } from '../repo/mailings.js';
import { OutcomeUnknownSendError, PermanentSendError, SendError, TransientSendError } from '../transport/index.js';
import type { UnsubscribeSigner } from '../unsubscribe.js';
import { composeMessage } from './compose.js';
import { DEFAULT_PUBLIC_BASE_URL, unsubscribeUrl } from './merge.js';
import { recordFailed, recordSent } from './settle.js';
import type { TransportFor } from './transports.js';

/**
 * The contact id a test send's unsubscribe token carries. The hosted page
 * (src/routes/unsubscribe.ts, from the unsubscribe team's branch, which exports
 * the same constant) recognises it, shows a preview and never writes anything, so
 * a test recipient clicking the link unsubscribes nobody. Defined here until that
 * branch is on main; then this imports it.
 */
export const TEST_UNSUBSCRIBE_CONTACT_ID = 'test';

/** Marks a test on the wire; also makes every test send distinct for a provider that deduplicates. */
export const TEST_SEND_HEADER = 'X-Lumitra-Test';

export type TestSenderOptions = {
  sql: Sql;
  transportFor: TransportFor;
  signer: UnsubscribeSigner;
  budget?: Budget;
  publicBaseUrl?: string;
  sendTimeoutMs?: number;
};

/**
 * Sends one test message of a mailing to one named address, outside the queue
 * and the recipient list, and archives it with `is_test`. It counts against the
 * provider's daily budget like every send. Merge values come from the request,
 * then the address's contact if it has one. Answers synchronously: the provider's
 * refusal is the caller's error (`provider_error`, with the archived message id
 * when there is one), a full budget is `daily_budget_exhausted`.
 */
export function createTestSender(options: TestSenderOptions) {
  const budget = options.budget ?? ledgerBudget;
  const base = options.publicBaseUrl ?? DEFAULT_PUBLIC_BASE_URL;
  const timeoutMs = options.sendTimeoutMs ?? 60_000;

  return async function sendTest(input: {
    workspaceId: string;
    mailing: MailingRow;
    html: string;
    to: string;
    merge: Record<string, unknown>;
  }): Promise<MailingTestResult> {
    const { workspaceId, mailing, sql } = { ...input, sql: options.sql };
    const prepared = await sql.begin(async (tx) => {
      const r = repos(tx);
      if (!(await r.providers.get(workspaceId, mailing.provider_id))) {
        throw new ApiError('unknown_provider', "The mailing's provider was deleted. Choose another one.", {
          provider_id: mailing.provider_id,
        });
      }
      const reservation = await budget.reserve(tx, workspaceId, mailing.provider_id, 1);
      if (!reservation.ok) {
        throw new ApiError(
          'daily_budget_exhausted',
          "The provider's daily recipient budget is used up.",
          reservation.reason === 'exhausted' ? { retry_after: reservation.retryAfter.toISOString() } : undefined,
        );
      }
      return {
        reservationId: reservation.reservationId,
        provider: (await r.providers.getForSend(workspaceId, mailing.provider_id))!,
        contact: await r.contacts.byEmail(workspaceId, input.to),
      };
    });
    const { provider, contact } = prepared;

    const token = options.signer.sign({
      workspace_id: workspaceId,
      contact_id: TEST_UNSUBSCRIBE_CONTACT_ID,
      mailing_id: mailing.id,
      topic_id: mailing.topic_id,
    });
    const message = composeMessage({
      provider,
      subject: mailing.subject,
      preheader: mailing.preheader,
      html: input.html,
      to: input.to,
      ctx: {
        email: input.to,
        merge: input.merge,
        contact: contact ? { first_name: contact.first_name, last_name: contact.last_name, properties: contact.properties } : null,
        unsubscribeUrl: unsubscribeUrl(base, token),
      },
      extraHeaders: { [TEST_SEND_HEADER]: randomUUID() },
    });

    let providerMessageId: string | null = null;
    let failure: SendError | null = null;
    let handedOver = true;
    try {
      const transport = (() => {
        try {
          return options.transportFor(provider);
        } catch (err) {
          handedOver = false;
          throw err;
        }
      })();
      providerMessageId = (await withTimeout(transport.send(message), timeoutMs)).messageId;
    } catch (err) {
      failure =
        err instanceof SendError
          ? err
          : handedOver
            ? new OutcomeUnknownSendError(err instanceof Error ? err.message : String(err))
            : new PermanentSendError(err instanceof Error ? err.message : String(err));
    }

    const archive = {
      mailingId: mailing.id,
      recipientId: null,
      contactId: contact?.id ?? null,
      to: input.to,
      subject: message.subject,
      html: message.html,
      providerId: provider.id,
      isTest: true,
      recipientCount: 1,
    };
    const eventCtx = { mailing, externalId: contact?.external_id ?? null };

    if (!failure) {
      const row = await sql.begin((tx) =>
        recordSent(tx, workspaceId, { ...archive, outcome: 'sent', error: null, providerMessageId }, eventCtx),
      );
      return { message_id: row.id, provider_message_id: providerMessageId };
    }

    if (failure instanceof TransientSendError || !handedOver) {
      // Not taken: the budget is given back.
      await sql.begin((tx) => budget.release(tx, workspaceId, prepared.reservationId));
    }
    if (failure instanceof TransientSendError) {
      throw new ApiError('provider_error', `The provider did not take the test message: ${failure.message}. Try again.`, {
        retryable: true,
      });
    }
    if (failure instanceof PermanentSendError) {
      const row = await sql.begin((tx) =>
        recordFailed(tx, workspaceId, { ...archive, outcome: 'failed', error: failure.message, providerMessageId: null }, { ...eventCtx, retryable: false }),
      );
      throw new ApiError('provider_error', `The provider refused the test message: ${failure.message}`, {
        retryable: false,
        message_id: row.id,
      });
    }
    throw new ApiError(
      'provider_error',
      `The connection to the provider broke off; the test message may or may not arrive: ${failure.message}`,
      { retryable: false, outcome_unknown: true },
    );
  };
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
