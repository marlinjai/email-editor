/**
 * The seam between the worker and a mail provider.
 *
 * Contract of `Transport.send`:
 * - Resolves with the provider's message id (null when the provider gives none)
 *   once the provider has ACCEPTED the message. Acceptance is all it promises;
 *   delivery to the inbox is reported later, if at all (bounces, complaints).
 * - Rejects with a `TransientSendError` when the provider did not take the
 *   message and trying again later may work (4xx reply, connection refused or
 *   reset before the message body was handed over, rate limited). The worker
 *   retries with backoff.
 * - Rejects with a `PermanentSendError` when the provider refused the message
 *   and repeating it will not help (5xx reply, invalid recipient, bad
 *   credentials). The worker marks the recipient failed.
 * - Rejects with an `OutcomeUnknownSendError` when the connection broke after
 *   the message body was handed over, so the provider may or may not have
 *   accepted it. The worker never retries it: the recipient ends `skipped` with
 *   `outcome_unknown`, the same as after a crash, because a duplicate cannot be
 *   unsent.
 * - Any other rejection is a bug or a crash, and the worker treats it like
 *   `OutcomeUnknownSendError`.
 *
 * A transport sends exactly the message it is given: merge fields are already
 * substituted and the List-Unsubscribe headers are already in `headers`.
 */
export type OutgoingMessage = {
  from: { name: string; email: string };
  /** Broadcasts always have exactly one recipient; the budget counts `to.length`. */
  to: string[];
  replyTo: string | null;
  subject: string;
  html: string;
  /** A plain-text alternative, if the caller has one. */
  text?: string;
  /** Extra headers, e.g. List-Unsubscribe and List-Unsubscribe-Post (RFC 8058). */
  headers: Record<string, string>;
};

export type SendResult = { messageId: string | null };

export interface Transport {
  send(message: OutgoingMessage): Promise<SendResult>;
  /** Checks the credentials by connecting, without sending. Throws a SendError when it fails. */
  verify(): Promise<void>;
  /** Releases pooled connections. */
  close(): Promise<void>;
}

export abstract class SendError extends Error {
  abstract readonly kind: 'transient' | 'permanent' | 'outcome_unknown';
  constructor(
    message: string,
    /** The provider's reply code, when there was one (an SMTP code or an HTTP status). */
    public readonly code: number | null = null,
  ) {
    super(message);
  }
}

export class TransientSendError extends SendError {
  readonly kind = 'transient' as const;
  override readonly name = 'TransientSendError';
}

export class PermanentSendError extends SendError {
  readonly kind = 'permanent' as const;
  override readonly name = 'PermanentSendError';
}

export class OutcomeUnknownSendError extends SendError {
  readonly kind = 'outcome_unknown' as const;
  override readonly name = 'OutcomeUnknownSendError';
}
