import { z } from 'zod';

/**
 * Every error the v1 API returns, with the HTTP status it is sent with.
 * A client switches on `code`, never on `message`, which is for humans and may
 * change wording at any time.
 */
export const ERROR_STATUS = {
  // 400: the request is malformed or fails validation
  invalid_request: 400,
  validation_failed: 400,
  invalid_cursor: 400,
  // 401 and 403: who is calling and whether they may
  unauthenticated: 401,
  invalid_api_key: 401,
  api_key_revoked: 401,
  forbidden: 403,
  insufficient_role: 403,
  // 404
  not_found: 404,
  // 409: the resource is in a state that does not allow the operation
  conflict: 409,
  already_exists: 409,
  mailing_invalid_state: 409,
  idempotency_key_reused: 409,
  last_owner: 409,
  // 413
  payload_too_large: 413,
  // 422: well-formed, but the content cannot be used
  compile_failed: 422,
  missing_unsubscribe_url: 422,
  mailing_not_ready: 422,
  unknown_topic: 422,
  unknown_provider: 422,
  recipient_suppressed: 422,
  unsupported_media_type: 422,
  // 429
  rate_limited: 429,
  daily_budget_exhausted: 429,
  plan_limit_reached: 429,
  // 5xx
  provider_error: 502,
  internal_error: 500,
  service_unavailable: 503,
} as const satisfies Record<string, number>;

export type ErrorCode = keyof typeof ERROR_STATUS;
export const ERROR_CODES = Object.keys(ERROR_STATUS) as [ErrorCode, ...ErrorCode[]];
export const ErrorCodeSchema = z.enum(ERROR_CODES);

/**
 * The body of every non-2xx response: `{ error: { code, message, details? } }`.
 * For `validation_failed`, `details.issues` lists the failing paths.
 */
export const ErrorBody = z.object({
  error: z.object({
    code: ErrorCodeSchema,
    message: z.string().min(1),
    details: z.record(z.unknown()).optional(),
  }),
});
export type ErrorBody = z.infer<typeof ErrorBody>;

export const ValidationIssue = z.object({
  path: z.array(z.union([z.string(), z.number()])),
  message: z.string(),
});
export type ValidationIssue = z.infer<typeof ValidationIssue>;

export function statusForError(code: ErrorCode): number {
  return ERROR_STATUS[code];
}

/** Builds the error envelope. Used by the service; the SDK only parses it. */
export function errorBody(code: ErrorCode, message: string, details?: Record<string, unknown>): ErrorBody {
  return details === undefined ? { error: { code, message } } : { error: { code, message, details } };
}

/** Errors a client may retry unchanged (with the same Idempotency-Key). */
export const RETRYABLE_ERRORS: readonly ErrorCode[] = [
  'rate_limited',
  'provider_error',
  'internal_error',
  'service_unavailable',
];
