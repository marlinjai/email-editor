/**
 * The typed error envelope `{ error: { code, message, details? } }`.
 *
 * The codes and their statuses mirror `@marlinjai/mail-contract` (errors.ts),
 * which is being written in parallel; once it is merged this table is replaced
 * by an import of ERROR_STATUS, so the two can never disagree.
 */
export const ERROR_STATUS = {
  invalid_request: 400,
  validation_failed: 400,
  invalid_cursor: 400,
  unauthenticated: 401,
  invalid_api_key: 401,
  api_key_revoked: 401,
  forbidden: 403,
  insufficient_role: 403,
  not_found: 404,
  conflict: 409,
  already_exists: 409,
  idempotency_key_reused: 409,
  last_owner: 409,
  payload_too_large: 413,
  internal_error: 500,
  service_unavailable: 503,
} as const satisfies Record<string, number>;

export type ErrorCode = keyof typeof ERROR_STATUS;

export type ErrorBody = { error: { code: ErrorCode; message: string; details?: Record<string, unknown> } };

export class ApiError extends Error {
  readonly status: number;
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = ERROR_STATUS[code];
  }

  toBody(): ErrorBody {
    return this.details === undefined
      ? { error: { code: this.code, message: this.message } }
      : { error: { code: this.code, message: this.message, details: this.details } };
  }
}
