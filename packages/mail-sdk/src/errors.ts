import type { ErrorCode } from '@marlinjai/mail-contract';

/**
 * The service refused the request or answered with a non-2xx status. `code` and
 * `status` come from the parsed `ErrorBody` envelope when the response carried
 * one; a 5xx with an unparseable body (a proxy's HTML page) still becomes a
 * `MailApiError` with `code: 'internal_error'` and the raw text in `details.raw`,
 * so a caller never has to guess what happened.
 */
export class MailApiError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details: Record<string, unknown> | undefined;
  readonly requestId: string | null;

  constructor(input: {
    code: ErrorCode;
    status: number;
    message: string;
    details?: Record<string, unknown>;
    requestId?: string | null;
  }) {
    super(input.message);
    this.name = 'MailApiError';
    this.code = input.code;
    this.status = input.status;
    this.details = input.details;
    this.requestId = input.requestId ?? null;
  }
}

/** The request never reached the service, or the connection failed mid-flight. */
export class MailNetworkError extends Error {
  readonly cause: unknown;

  constructor(message: string, cause: unknown) {
    super(message);
    this.name = 'MailNetworkError';
    this.cause = cause;
  }
}

/** The request exceeded `timeoutMs` before the service answered. */
export class MailTimeoutError extends Error {
  readonly timeoutMs: number;

  constructor(timeoutMs: number) {
    super(`mail service request timed out after ${timeoutMs}ms`);
    this.name = 'MailTimeoutError';
    this.timeoutMs = timeoutMs;
  }
}

/**
 * The service answered 2xx but the body did not match the contract's response
 * schema. This is a bug in the service or a contract version mismatch, never
 * retried: retrying an already-succeeded mutating call would risk a duplicate.
 */
export class MailResponseValidationError extends Error {
  readonly operationId: string;
  readonly issues: unknown;

  constructor(operationId: string, issues: unknown) {
    super(`response for "${operationId}" did not match the mail-contract schema`);
    this.name = 'MailResponseValidationError';
    this.operationId = operationId;
    this.issues = issues;
  }
}
