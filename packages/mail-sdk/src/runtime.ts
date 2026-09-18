/**
 * Runtime primitives: only `fetch`, `AbortController` and Web Crypto, so the SDK
 * runs unmodified in Node 18+ and on edge runtimes. Node 18 ships `fetch` and
 * `AbortController` globally but `globalThis.crypto` only from Node 19 without a
 * flag; `randomUUID()` throws a clear error rather than silently falling back to
 * a weaker source, which is why the README calls out Node 20+ as the floor we test.
 */

function webCrypto(): Crypto {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (!c?.randomUUID) {
    throw new Error(
      'globalThis.crypto.randomUUID is not available in this runtime (Node 18 needs --experimental-global-webcrypto or Node 19+); @marlinjai/mail-sdk needs Web Crypto to mint idempotency keys',
    );
  }
  return c;
}

/** A fresh idempotency key, reused across every retry of the same call. */
export function generateIdempotencyKey(): string {
  return webCrypto().randomUUID();
}

export function defaultSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason);
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(signal.reason);
      },
      { once: true },
    );
  });
}

/**
 * Exponential backoff with full jitter, capped at `maxDelayMs`.
 * `attempt` is 0-indexed (the first retry, after the initial attempt, is 0).
 */
export function backoffDelayMs(attempt: number, baseMs: number, maxDelayMs: number, random: () => number = Math.random): number {
  const exp = Math.min(maxDelayMs, baseMs * 2 ** attempt);
  return Math.floor(random() * exp);
}

/** A hard ceiling on any single sleep, including one taken from `Retry-After`. */
export const MAX_RETRY_DELAY_MS = 60_000;

/**
 * Parses `Retry-After`: either a number of seconds or an HTTP-date. Returns
 * milliseconds to wait, capped at `MAX_RETRY_DELAY_MS` so a provider that sends
 * an hours-long value can never hang the caller.
 */
export function parseRetryAfterMs(header: string | null, now: () => number = Date.now): number | null {
  if (!header) return null;
  const trimmed = header.trim();
  if (/^\d+$/.test(trimmed)) {
    return Math.min(MAX_RETRY_DELAY_MS, Number(trimmed) * 1000);
  }
  const at = Date.parse(trimmed);
  if (Number.isNaN(at)) return null;
  const delta = at - now();
  if (delta <= 0) return 0;
  return Math.min(MAX_RETRY_DELAY_MS, delta);
}
