import { MailApiError, MailNetworkError, MailResponseValidationError, MailTimeoutError, type ErrorCode } from '@marlinjai/mail-sdk';
import { BILLING_NOT_CONFIGURED, isBillingNotConfigured } from './billing-state';
import type { ActionError } from './result';

/**
 * The contract's error codes in words a person can act on. The service's own
 * `message` is kept for the codes whose specifics only it knows (a validation
 * detail, which state a mailing is in); everything else gets a sentence that
 * names the problem and, where there is one, the way forward.
 */
const MESSAGES: Record<ErrorCode, string> = {
  invalid_request: 'The request was not understood. Reload the page and try again.',
  validation_failed: 'Some fields need attention.',
  invalid_cursor: 'That page of results has expired. Go back to the first page.',
  unauthenticated: 'Your session has ended. Sign in again to continue.',
  invalid_api_key: 'Your session has ended. Sign in again to continue.',
  api_key_revoked: 'Your session has ended. Sign in again to continue.',
  forbidden: 'You do not have access to this workspace.',
  insufficient_role: 'Your role in this workspace does not allow this. Ask an admin or owner.',
  not_found: 'This no longer exists. It may have been deleted by someone else.',
  conflict: 'Someone else changed this in the meantime. Reload to see the latest version.',
  already_exists: 'That already exists. Choose another name or slug.',
  mailing_invalid_state: 'This mailing has moved on and that action no longer applies. The page has the current state.',
  idempotency_key_reused: 'This action was already submitted with different values. Reload and try again.',
  last_owner: 'A workspace needs at least one owner. Make someone else an owner first.',
  provider_anomaly:
    "This provider's bounce circuit breaker is open: too many recipients in a row were refused alike. Check the provider, then clear its anomaly under Settings, Providers.",
  payload_too_large: 'That is too large to upload or save.',
  compile_failed: 'The email does not compile. Fix the errors shown in the preview before sending.',
  missing_unsubscribe_url:
    'The email has no unsubscribe link. Add {{unsubscribe_url}} to the template, usually in the footer, before sending.',
  mailing_not_ready: 'Add at least one recipient before sending.',
  unknown_topic: 'That topic does not exist in this workspace. Pick one from the list.',
  unknown_provider: 'That provider does not exist in this workspace. Pick one from the list.',
  recipient_suppressed: 'That address is suppressed and will not receive mail from this workspace.',
  unsupported_media_type: 'Only PNG, JPEG, GIF and WebP images can be uploaded.',
  tracking_disabled: 'Opens and clicks are not tracked in this workspace. Turn tracking on under Settings first.',
  rate_limited: 'Too many requests at once. Wait a moment and try again.',
  daily_budget_exhausted: "This provider's daily sending budget is used up. Sending continues when it frees up.",
  plan_limit_reached: "This workspace has reached its plan's limit.",
  provider_error: 'The mail provider refused or did not answer. Check the provider settings and try again.',
  internal_error: 'Something went wrong on our side. Try again; if it keeps happening, quote the request id.',
  service_unavailable: 'The mail service is busy or restarting. Try again in a moment.',
};

/** Codes whose service message carries the specific reason and is worth showing as is. */
const SERVICE_MESSAGE_WINS: ReadonlySet<ErrorCode> = new Set([
  'validation_failed',
  'mailing_invalid_state',
  'conflict',
  'already_exists',
  'insufficient_role',
  'provider_error',
]);

type Issue = { path?: Array<string | number>; message?: string };

function fieldErrors(details: Record<string, unknown> | undefined): Record<string, string> | undefined {
  const issues = details?.issues;
  if (!Array.isArray(issues) || issues.length === 0) return undefined;
  const out: Record<string, string> = {};
  for (const raw of issues as Issue[]) {
    const key = (raw.path ?? []).join('.') || '_';
    if (!out[key] && typeof raw.message === 'string') out[key] = raw.message;
  }
  return out;
}

function messageFor(err: MailApiError): string {
  const base = MESSAGES[err.code] ?? MESSAGES.internal_error;
  // `already_exists` names what exists ("the slug news"); the service says it best.
  if (err.code === 'already_exists' && err.message) return `${err.message} Choose another.`;
  // The service names the plan, the limit and what to do; the screen adds the way to Billing.
  if (err.code === 'plan_limit_reached' && err.message) return err.message;
  if (isBillingNotConfigured(err.code, err.details)) return BILLING_NOT_CONFIGURED;
  if (SERVICE_MESSAGE_WINS.has(err.code) && err.message) return `${base} ${err.message}`;
  return base;
}

/** Turns anything a mail service call can throw into what the screen shows. */
export function describeError(err: unknown): ActionError {
  if (err instanceof MailApiError) {
    const message = messageFor(err);
    return {
      code: err.code,
      message,
      fields: fieldErrors(err.details),
      requestId: err.requestId,
      details: err.details,
    };
  }
  if (err instanceof MailTimeoutError || err instanceof MailNetworkError) {
    return {
      code: 'network',
      message: 'The mail service could not be reached. Check back in a moment; nothing was changed unless the page says so.',
    };
  }
  if (err instanceof Error && err.name === 'DashboardConfigError') {
    return {
      code: 'service_unavailable',
      message: 'The dashboard is not configured to reach the mail service. This is on our side; nothing was changed.',
    };
  }
  if (err instanceof MailResponseValidationError) {
    return {
      code: 'internal_error',
      message:
        'The mail service answered in a shape this dashboard does not expect. Reload; if it persists, the two are out of step after a deploy.',
    };
  }
  return { code: 'internal_error', message: MESSAGES.internal_error };
}
