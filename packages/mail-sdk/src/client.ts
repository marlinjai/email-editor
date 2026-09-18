import { HEALTH_PATH, SUBJECT_HEADER, WORKSPACE_HEADER, type OperationId, type RouteResponse } from '@marlinjai/mail-contract';
import { buildAuthorizationHeader, execute, type CoreConfig, type ExecuteArgs, type RequestOpts } from './core';
import { createNamespaces, type MailNamespaces } from './namespaces';
import { paginate, type PageItem, type PaginatableOperationId, type PaginateArgs } from './pagination';

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_RETRIES = 3;

export interface BaseClientOptions {
  /** The mail service's origin, no trailing slash needed (e.g. `https://mail.lumitra.co`). */
  baseUrl: string;
  /** Defaults to the runtime's global `fetch`. Override in tests or to add instrumentation. */
  fetch?: typeof fetch;
  /** Per-attempt timeout. A retried call may take up to `(maxRetries + 1) * timeoutMs` plus backoff. */
  timeoutMs?: number;
  /** Retries on `RETRYABLE_ERRORS` and network failures only; 4xx errors never retry. */
  maxRetries?: number;
  userAgent?: string;
  /** Validates every response against the contract's zod schema. Disable only to shave latency once you trust the deployment. */
  validateResponses?: boolean;
  /** @internal Test-only hook: replaces the backoff sleep. Never set this in application code. */
  __sleep?: CoreConfig['sleep'];
  /** @internal Test-only hook: replaces the jitter source. Never set this in application code. */
  __random?: CoreConfig['random'];
}

export interface MailClientOptions extends BaseClientOptions {
  /** A workspace API key (`Authorization: Bearer <key>`), scoped to one workspace and to `full`, `send` or `read`. */
  apiKey: string;
}

/** Every namespaced method, plus the two escape hatches: `request` for any operation id, `paginate` for cursor lists. */
export interface MailClient extends MailNamespaces {
  request<K extends OperationId>(operationId: K, args?: ExecuteArgs<K>, opts?: RequestOpts): Promise<RouteResponse<K>>;
  paginate<K extends PaginatableOperationId>(
    operationId: K,
    args?: PaginateArgs<K>,
    opts?: RequestOpts,
  ): AsyncGenerator<PageItem<K>, void, void>;
  /**
   * Checks the service's liveness probe (`HEALTH_PATH`, outside `/v1`, no
   * credentials sent). Never throws: a network failure or a non-2xx status both
   * resolve `false`, since this is meant for a caller polling "is it up", not one
   * that wants a typed error.
   */
  health(opts?: { signal?: AbortSignal }): Promise<boolean>;
}

function resolveFetch(provided: typeof fetch | undefined): typeof fetch {
  const impl = provided ?? (typeof fetch === 'function' ? fetch : undefined);
  if (!impl) {
    throw new Error(
      '@marlinjai/mail-sdk needs a `fetch` implementation: none was given and none is global in this runtime (Node 18+ and every edge runtime provide one; pass `fetch` explicitly otherwise)',
    );
  }
  return impl.bind(globalThis);
}

function buildConfig(options: BaseClientOptions, authHeaders: () => Record<string, string>): CoreConfig {
  if (options.baseUrl.trim().length === 0) throw new Error('createMailClient requires a non-empty baseUrl');
  return {
    baseUrl: options.baseUrl,
    authHeaders,
    fetch: resolveFetch(options.fetch),
    timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    maxRetries: options.maxRetries ?? DEFAULT_MAX_RETRIES,
    userAgent: options.userAgent,
    validateResponses: options.validateResponses ?? true,
    sleep: options.__sleep,
    random: options.__random,
  };
}

async function checkHealth(config: CoreConfig, opts?: { signal?: AbortSignal }): Promise<boolean> {
  try {
    const response = await config.fetch(`${config.baseUrl.replace(/\/+$/, '')}${HEALTH_PATH}`, {
      method: 'GET',
      signal: opts?.signal,
    });
    return response.ok;
  } catch {
    return false;
  }
}

function buildClient(config: CoreConfig): MailClient {
  return {
    ...createNamespaces(config),
    request: (operationId, args, opts) => execute(config, operationId, args ?? {}, opts),
    paginate: (operationId, args, opts) => paginate(config, operationId, args ?? {}, opts),
    health: (opts) => checkHealth(config, opts),
  } as MailClient;
}

/**
 * A typed client for the Lumitra Mail v1 API, authenticated with a workspace API
 * key. Safe to use in a browser, a server, or an edge function: it holds only the
 * key the caller gives it and never assumes a Node runtime.
 */
export function createMailClient(options: MailClientOptions): MailClient {
  const config = buildConfig(options, () => buildAuthorizationHeader(options.apiKey));
  return buildClient(config);
}

export interface DashboardMailClientOptions extends BaseClientOptions {
  /** The dashboard's own service token, distinct from any workspace API key. */
  serviceToken: string;
}

/** The signed-in person the dashboard is calling on behalf of, for one request. */
export interface DashboardUserContext {
  /** The person's auth-brain subject. */
  subject: string;
  /**
   * Omit for a `dashboard`-access route reached before a workspace exists yet
   * (`workspaces.create`, `workspaces.list`): the service checks membership and
   * role against this workspace on every other route, so it is required there.
   */
  workspaceId?: string;
}

export interface DashboardMailClient {
  /** Binds the client to one signed-in person and workspace for the calls made through it. */
  forUser(user: DashboardUserContext): MailClient;
}

function assertServerSide(): void {
  const hasWindow = typeof globalThis === 'object' && 'window' in globalThis && (globalThis as { window?: unknown }).window !== undefined;
  if (hasWindow) {
    throw new Error(
      'createDashboardMailClient must never run in a browser: its service token authenticates as the whole dashboard, not one signed-in person, and a browser bundle would ship it to every visitor. Call it only from server-side code (a Next.js server action, route handler or server component) and pass the signed-in person to forUser() per request.',
    );
  }
}

/**
 * The dashboard variant: authenticates with the dashboard's own service token and
 * carries the signed-in person's auth-brain subject and workspace on every call,
 * which the service checks for membership and role. Server-side only, by
 * construction: constructing this in a browser bundle throws immediately rather
 * than silently shipping the service token to every visitor.
 */
export function createDashboardMailClient(options: DashboardMailClientOptions): DashboardMailClient {
  assertServerSide();
  return {
    forUser(user: DashboardUserContext): MailClient {
      const config = buildConfig(options, () => ({
        ...buildAuthorizationHeader(options.serviceToken),
        [SUBJECT_HEADER]: user.subject,
        ...(user.workspaceId ? { [WORKSPACE_HEADER]: user.workspaceId } : {}),
      }));
      return buildClient(config);
    },
  };
}
