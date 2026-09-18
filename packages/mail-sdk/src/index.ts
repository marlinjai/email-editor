/**
 * @marlinjai/mail-sdk: the typed client for the Lumitra Mail v1 API.
 *
 * Every request and response shape comes from `@marlinjai/mail-contract`; this
 * package only adds the HTTP mechanics (auth, retries, idempotency, pagination)
 * on top. Runs in Node 18+ (Web Crypto needs Node 20+ or `--experimental-global-webcrypto`
 * on Node 18/19) and on every major edge runtime: only `fetch`, `FormData`,
 * `AbortController` and `globalThis.crypto` are used, no Node built-ins.
 */
export {
  createMailClient,
  createDashboardMailClient,
  type MailClient,
  type MailClientOptions,
  type DashboardMailClient,
  type DashboardMailClientOptions,
  type DashboardUserContext,
  type BaseClientOptions,
} from './client';
export { MailApiError, MailNetworkError, MailTimeoutError, MailResponseValidationError } from './errors';
export type { RequestOpts, ExecuteArgs } from './core';
export type { PaginatableOperationId, PaginateArgs, PageItem } from './pagination';
export { generateIdempotencyKey } from './runtime';

/**
 * The whole contract is re-exported wholesale, so `@marlinjai/mail-sdk` alone is
 * enough for a typical integration: every resource shape, `OperationId`, the
 * `ErrorCode` union, and, for a webhook receiver, `verifyWebhook`, `signWebhook`,
 * `WebhookEvent` and the header name constants (see the README for the full
 * receiver example).
 */
export * from '@marlinjai/mail-contract';
