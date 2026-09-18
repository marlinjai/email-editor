import {
  PermanentSendError,
  SendError,
  TransientSendError,
  type OutgoingMessage,
  type SendResult,
  type Transport,
} from './types.js';

/**
 * What the next send does:
 * - `transient` / `permanent`: rejects with that SendError, nothing recorded.
 * - `hang`: never settles until `release()` (a provider that stops answering).
 * - `crash`: the provider ACCEPTS the message (it is recorded in `sent`), then the
 *   call rejects with a plain Error, as if the process died before it could note
 *   the success. This is the case the worker must reconcile as `outcome_unknown`.
 */
export type MemoryFailure = 'transient' | 'permanent' | 'hang' | 'crash';

export type RecordedSend = OutgoingMessage & { messageId: string; at: Date };

/**
 * An in-memory Transport for tests: records every accepted message and can be
 * told to fail the next sends in a chosen way. Deterministic message ids
 * (`mem-1`, `mem-2`, ...).
 */
export class MemoryTransport implements Transport {
  readonly sent: RecordedSend[] = [];
  /** Every call to send, in order, including failed ones. */
  readonly attempts: OutgoingMessage[] = [];
  private plan: Array<MemoryFailure | SendError> = [];
  private hung: Array<(err: Error) => void> = [];
  private counter = 0;
  verifyError: Error | null = null;
  closed = false;

  /** Queues failures for the next `times` sends (default once), after any already queued. */
  failNext(failure: MemoryFailure, times = 1): this {
    for (let i = 0; i < times; i++) this.plan.push(failure);
    return this;
  }

  /** Queues one send that rejects with exactly this error (an SMTP reply the test chose). */
  failNextWith(error: SendError): this {
    this.plan.push(error);
    return this;
  }

  /** How many sends are currently hanging. */
  get hanging(): number {
    return this.hung.length;
  }

  /** Rejects every hanging send with a TransientSendError (a timeout), so a test can finish. */
  release(): void {
    const pending = this.hung;
    this.hung = [];
    for (const reject of pending) reject(new TransientSendError('timed out'));
  }

  async send(message: OutgoingMessage): Promise<SendResult> {
    if (this.closed) throw new Error('MemoryTransport: send after close');
    this.attempts.push(message);
    const failure = this.plan.shift();
    if (failure instanceof SendError) throw failure;
    switch (failure) {
      case 'transient':
        throw new TransientSendError('simulated transient failure', 451);
      case 'permanent':
        throw new PermanentSendError('simulated permanent rejection', 550);
      case 'hang':
        return new Promise<SendResult>((_, reject) => this.hung.push(reject));
      case 'crash':
        this.accept(message);
        throw new Error('simulated crash after the provider accepted the message');
      default:
        return { messageId: this.accept(message) };
    }
  }

  async verify(): Promise<void> {
    if (this.verifyError) throw this.verifyError;
  }

  async close(): Promise<void> {
    this.release();
    this.closed = true;
  }

  private accept(message: OutgoingMessage): string {
    const messageId = `mem-${++this.counter}`;
    this.sent.push({ ...message, messageId, at: new Date() });
    return messageId;
  }
}
