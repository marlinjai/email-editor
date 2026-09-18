import { createHash } from 'node:crypto';
import type { Context, MiddlewareHandler } from 'hono';
import type { AppEnv } from './context.js';
import { ApiError } from './errors.js';
import type { idempotencyRepo } from './repo/idempotency.js';
import type { Sealer } from './sealing.js';

/** Identical to IDEMPOTENCY_KEY_HEADER and its limit in `@marlinjai/mail-contract`. */
export const IDEMPOTENCY_KEY_HEADER = 'idempotency-key';
export const IDEMPOTENCY_KEY_MAX_LENGTH = 255;
/** Set on a response that is a replay of the first one, so a client can tell. */
export const IDEMPOTENT_REPLAYED_HEADER = 'idempotent-replayed';

type Ledger = ReturnType<typeof idempotencyRepo>;

/** Where a key lives: the workspace, or for creating one, the acting person. */
export type IdempotencyScope = { workspaceId: string | null; scope: string };

export function workspaceScope(c: Context<AppEnv>): IdempotencyScope {
  const { workspaceId } = c.get('access');
  return { workspaceId, scope: `ws:${workspaceId}` };
}

export function subjectScope(c: Context<AppEnv>): IdempotencyScope {
  const caller = c.get('caller');
  if (caller.kind !== 'dashboard') throw new ApiError('forbidden', 'Only a person can create a workspace.');
  return { workspaceId: null, scope: `subject:${caller.subject}` };
}

function fingerprint(method: string, path: string, body: string): string {
  return createHash('sha256').update(`${method}\n${path}\n${body}`).digest('hex');
}

/**
 * Makes a mutating route safe to retry. With an `Idempotency-Key` header:
 *
 * - the first request claims the key and runs; its response (any status below
 *   500) is stored against the key;
 * - a retry with the same key and the same request gets the stored response
 *   back, marked `idempotent-replayed: true`, and nothing runs twice;
 * - the same key with a different method, path or body is refused
 *   (`idempotency_key_reused`), because replaying the first answer would be a lie;
 * - a retry while the first is still running is refused (`conflict`), not run;
 * - a 5xx releases the key, since the client is told to retry those.
 *
 * Without the header the route simply runs; the key is the client's opt-in.
 *
 * Stored responses are sealed (AES-256-GCM under MAIL_SECRETS_KEY), because one
 * of them is the only copy of a freshly minted API key: a dump of the ledger
 * must not yield a working credential.
 */
export function idempotent(
  ledger: () => Ledger,
  sealer: Sealer,
  scopeOf: (c: Context<AppEnv>) => IdempotencyScope,
): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const key = c.req.header(IDEMPOTENCY_KEY_HEADER);
    if (key === undefined) return next();
    if (key.length === 0 || key.length > IDEMPOTENCY_KEY_MAX_LENGTH || !/^[\x21-\x7e]+$/.test(key)) {
      throw new ApiError(
        'invalid_request',
        `"Idempotency-Key" must be 1 to ${IDEMPOTENCY_KEY_MAX_LENGTH} printable ASCII characters.`,
      );
    }

    const { workspaceId, scope } = scopeOf(c);
    const body = await c.req.text();
    const hash = fingerprint(c.req.method, c.req.path, body);
    const repo = ledger();

    const claim = await repo.claim(workspaceId, scope, key, hash);
    if (!claim.claimed) {
      const { record } = claim;
      if (record.request_hash !== hash) {
        throw new ApiError(
          'idempotency_key_reused',
          'This Idempotency-Key was already used for a different request. Use a new key for a new request.',
        );
      }
      if (record.state !== 'completed' || record.response_status === null) {
        throw new ApiError('conflict', 'A request with this Idempotency-Key is still being processed. Retry shortly.');
      }
      return new Response(record.response_body === null ? null : sealer.open(record.response_body), {
        status: record.response_status,
        headers: { 'content-type': 'application/json; charset=utf-8', [IDEMPOTENT_REPLAYED_HEADER]: 'true' },
      });
    }

    try {
      await next();
    } catch (err) {
      await repo.release(scope, key);
      throw err;
    }
    // Hono turns a thrown error into c.res through onError before control
    // returns here, so the status is final at this point.
    if (c.res.status >= 500) {
      await repo.release(scope, key);
      return;
    }
    const responseBody = await c.res.clone().text();
    await repo.complete(scope, key, c.res.status, sealer.seal(responseBody));
  };
}
