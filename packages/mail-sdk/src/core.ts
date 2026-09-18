import {
  AUTHORIZATION_HEADER,
  BEARER_PREFIX,
  ErrorBody,
  IDEMPOTENCY_KEY_HEADER,
  REQUEST_ID_HEADER,
  RETRYABLE_ERRORS,
  RETRY_AFTER_HEADER,
  type ErrorCode,
  type OperationId,
  type RouteBody,
  type RouteDef,
  type RouteParams,
  type RouteQuery,
  type RouteResponse,
  acceptsIdempotencyKey,
  buildPath,
  routes,
} from '@marlinjai/mail-contract';
import { MailApiError, MailNetworkError, MailResponseValidationError, MailTimeoutError } from './errors';
import { backoffDelayMs, defaultSleep, generateIdempotencyKey, parseRetryAfterMs } from './runtime';

/** Produces the auth headers for one request. A dashboard client varies these per call. */
export type AuthHeaderProvider = () => Record<string, string>;

export interface CoreConfig {
  baseUrl: string;
  authHeaders: AuthHeaderProvider;
  fetch: typeof fetch;
  timeoutMs: number;
  maxRetries: number;
  userAgent?: string;
  validateResponses: boolean;
  /** Test hooks only; production callers never set these. */
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  random?: () => number;
}

export interface RequestOpts {
  /** Reused across every retry of this call. Auto-generated when omitted. */
  idempotencyKey?: string;
  signal?: AbortSignal;
}

export interface ExecuteArgs<K extends OperationId> {
  params?: RouteParams<K>;
  query?: RouteQuery<K>;
  body?: RouteBody<K>;
}

const RETRYABLE_SET = new Set<ErrorCode>(RETRYABLE_ERRORS);
const RETRY_BASE_MS = 250;
const RETRY_MAX_MS = 8_000;
const MAX_ERROR_TEXT_LENGTH = 2_000;

function toQueryString(query: Record<string, unknown> | undefined): string {
  if (!query) return '';
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue;
    params.set(key, String(value));
  }
  const s = params.toString();
  return s.length > 0 ? `?${s}` : '';
}

function isCallerAbort(err: unknown, callerSignal: AbortSignal | undefined): boolean {
  return callerSignal?.aborted === true && err instanceof Error && err.name === 'AbortError';
}

async function parseErrorBody(status: number, text: string): Promise<{ code: ErrorCode; message: string; details?: Record<string, unknown> }> {
  if (text.length > 0) {
    try {
      const json = JSON.parse(text) as unknown;
      const parsed = ErrorBody.safeParse(json);
      if (parsed.success) return parsed.data.error;
    } catch {
      // fall through: not JSON, or not the error envelope
    }
  }
  const raw = text.slice(0, MAX_ERROR_TEXT_LENGTH);
  const code: ErrorCode = status >= 500 ? 'internal_error' : 'invalid_request';
  return {
    code,
    message: `mail service returned ${status} with an unparseable body`,
    details: raw.length > 0 ? { raw } : undefined,
  };
}

/**
 * Runs one HTTP call for an operation, with a per-attempt timeout, retries on
 * `RETRYABLE_ERRORS` and on network failures, and a reused Idempotency-Key
 * across every attempt (this is what makes a retry after a partial failure safe:
 * the service treats a replay with the same key and body as the first call).
 */
export async function execute<K extends OperationId>(
  config: CoreConfig,
  operationId: K,
  args: ExecuteArgs<K> = {},
  opts: RequestOpts = {},
): Promise<RouteResponse<K>> {
  const route = routes[operationId] as RouteDef;
  const sleep = config.sleep ?? defaultSleep;
  const path = buildPath(route.path, ((args.params as unknown as Record<string, string | number>) ?? {}));
  const url = `${config.baseUrl.replace(/\/+$/, '')}${path}${toQueryString(args.query as Record<string, unknown> | undefined)}`;
  const hasJsonBody = route.body !== undefined;
  const bodyText = hasJsonBody ? JSON.stringify(args.body ?? {}) : undefined;

  const idempotencyKey = acceptsIdempotencyKey(route) ? (opts.idempotencyKey ?? generateIdempotencyKey()) : undefined;

  let lastError: unknown;
  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    const timeoutController = new AbortController();
    const timeout = setTimeout(() => timeoutController.abort(), config.timeoutMs);
    const onCallerAbort = () => timeoutController.abort(opts.signal?.reason);
    opts.signal?.addEventListener('abort', onCallerAbort, { once: true });

    try {
      const headers: Record<string, string> = {
        ...config.authHeaders(),
        accept: 'application/json',
      };
      if (hasJsonBody) headers['content-type'] = 'application/json';
      if (idempotencyKey) headers[IDEMPOTENCY_KEY_HEADER] = idempotencyKey;
      if (config.userAgent) headers['user-agent'] = config.userAgent;

      let response: Response;
      try {
        response = await config.fetch(url, {
          method: route.method,
          headers,
          body: bodyText,
          signal: timeoutController.signal,
        });
      } catch (err) {
        if (isCallerAbort(err, opts.signal)) throw err;
        if (err instanceof Error && err.name === 'AbortError') {
          lastError = new MailTimeoutError(config.timeoutMs);
        } else {
          lastError = new MailNetworkError('mail service request failed before a response was received', err);
        }
        if (attempt < config.maxRetries) {
          await sleep(backoffDelayMs(attempt, RETRY_BASE_MS, RETRY_MAX_MS, config.random), opts.signal);
          continue;
        }
        throw lastError;
      }

      const requestId = response.headers.get(REQUEST_ID_HEADER);
      if (response.status >= 200 && response.status < 300) {
        const text = await response.text();
        const json = text.length > 0 ? (JSON.parse(text) as unknown) : undefined;
        if (!config.validateResponses) return json as RouteResponse<K>;
        const parsed = route.response.safeParse(json);
        if (!parsed.success) throw new MailResponseValidationError(operationId, parsed.error.issues);
        return parsed.data as RouteResponse<K>;
      }

      const text = await response.text();
      const errorBody = await parseErrorBody(response.status, text);
      const apiError = new MailApiError({
        code: errorBody.code,
        status: response.status,
        message: errorBody.message,
        details: errorBody.details,
        requestId,
      });
      lastError = apiError;

      const retryable = RETRYABLE_SET.has(errorBody.code);
      if (retryable && attempt < config.maxRetries) {
        const retryAfterMs = parseRetryAfterMs(response.headers.get(RETRY_AFTER_HEADER));
        const delay = retryAfterMs ?? backoffDelayMs(attempt, RETRY_BASE_MS, RETRY_MAX_MS, config.random);
        await sleep(delay, opts.signal);
        continue;
      }
      throw apiError;
    } finally {
      clearTimeout(timeout);
      opts.signal?.removeEventListener('abort', onCallerAbort);
    }
  }
  // Unreachable: the loop always returns or throws before exhausting attempts.
  throw lastError instanceof Error ? lastError : new Error('mail service request failed');
}

export interface MultipartArgs<K extends OperationId> {
  params?: RouteParams<K>;
  file: Blob;
  filename?: string;
  /** For routes whose multipart form carries a second JSON field (e.g. `imports.create`). */
  json?: unknown;
}

/** Like {@link execute}, for the two `multipart/form-data` routes. */
export async function executeMultipart<K extends OperationId>(
  config: CoreConfig,
  operationId: K,
  args: MultipartArgs<K>,
  opts: RequestOpts = {},
): Promise<RouteResponse<K>> {
  const route = routes[operationId] as RouteDef;
  if (!route.multipart) throw new Error(`"${operationId}" is not a multipart route`);
  const sleep = config.sleep ?? defaultSleep;
  const path = buildPath(route.path, ((args.params as unknown as Record<string, string | number>) ?? {}));
  const url = `${config.baseUrl.replace(/\/+$/, '')}${path}`;
  const idempotencyKey = acceptsIdempotencyKey(route) ? (opts.idempotencyKey ?? generateIdempotencyKey()) : undefined;

  let lastError: unknown;
  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    const timeoutController = new AbortController();
    const timeout = setTimeout(() => timeoutController.abort(), config.timeoutMs);
    const onCallerAbort = () => timeoutController.abort(opts.signal?.reason);
    opts.signal?.addEventListener('abort', onCallerAbort, { once: true });

    try {
      const form = new FormData();
      form.set(route.multipart.fileField, args.file, args.filename);
      if (route.multipart.jsonField) {
        form.set(route.multipart.jsonField, JSON.stringify(args.json ?? {}));
      }
      const headers: Record<string, string> = { ...config.authHeaders(), accept: 'application/json' };
      if (idempotencyKey) headers[IDEMPOTENCY_KEY_HEADER] = idempotencyKey;
      if (config.userAgent) headers['user-agent'] = config.userAgent;

      let response: Response;
      try {
        response = await config.fetch(url, { method: route.method, headers, body: form, signal: timeoutController.signal });
      } catch (err) {
        if (isCallerAbort(err, opts.signal)) throw err;
        if (err instanceof Error && err.name === 'AbortError') {
          lastError = new MailTimeoutError(config.timeoutMs);
        } else {
          lastError = new MailNetworkError('mail service request failed before a response was received', err);
        }
        if (attempt < config.maxRetries) {
          await sleep(backoffDelayMs(attempt, RETRY_BASE_MS, RETRY_MAX_MS, config.random), opts.signal);
          continue;
        }
        throw lastError;
      }

      const requestId = response.headers.get(REQUEST_ID_HEADER);
      if (response.status >= 200 && response.status < 300) {
        const text = await response.text();
        const json = text.length > 0 ? (JSON.parse(text) as unknown) : undefined;
        if (!config.validateResponses) return json as RouteResponse<K>;
        const parsed = route.response.safeParse(json);
        if (!parsed.success) throw new MailResponseValidationError(operationId, parsed.error.issues);
        return parsed.data as RouteResponse<K>;
      }

      const text = await response.text();
      const errorBody = await parseErrorBody(response.status, text);
      const apiError = new MailApiError({
        code: errorBody.code,
        status: response.status,
        message: errorBody.message,
        details: errorBody.details,
        requestId,
      });
      lastError = apiError;
      const retryable = RETRYABLE_SET.has(errorBody.code);
      if (retryable && attempt < config.maxRetries) {
        const retryAfterMs = parseRetryAfterMs(response.headers.get(RETRY_AFTER_HEADER));
        const delay = retryAfterMs ?? backoffDelayMs(attempt, RETRY_BASE_MS, RETRY_MAX_MS, config.random);
        await sleep(delay, opts.signal);
        continue;
      }
      throw apiError;
    } finally {
      clearTimeout(timeout);
      opts.signal?.removeEventListener('abort', onCallerAbort);
    }
  }
  throw lastError instanceof Error ? lastError : new Error('mail service request failed');
}

export function buildAuthorizationHeader(token: string): Record<string, string> {
  return { [AUTHORIZATION_HEADER]: `${BEARER_PREFIX}${token}` };
}
