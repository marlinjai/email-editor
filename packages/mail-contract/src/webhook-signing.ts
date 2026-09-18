/**
 * Webhook signatures.
 *
 * Each request carries two headers:
 * - `x-mail-timestamp`: Unix time in seconds when the request was signed.
 * - `x-mail-signature`: `v1=<hex>`, where `<hex>` is HMAC-SHA256 (hash-based
 *   message authentication code over SHA-256) keyed with the endpoint secret over
 *   the string `${timestamp}.${rawBody}`. During a secret rotation the header may
 *   carry several comma-separated `v1=` values; one matching is enough.
 * - `x-mail-event-id`: the event id, for deduplication before parsing.
 *
 * A receiver verifies over the raw body bytes it received (before any JSON
 * parsing), rejects a timestamp more than `WEBHOOK_TOLERANCE_SECONDS` from its own
 * clock, and compares in constant time. The helpers here use only Web Crypto, so
 * they run in Node 18+ and on edge runtimes alike.
 */

export const WEBHOOK_SIGNATURE_HEADER = 'x-mail-signature';
export const WEBHOOK_TIMESTAMP_HEADER = 'x-mail-timestamp';
export const WEBHOOK_EVENT_ID_HEADER = 'x-mail-event-id';
export const WEBHOOK_SIGNATURE_VERSION = 'v1';
export const WEBHOOK_TOLERANCE_SECONDS = 300;
export const WEBHOOK_SECRET_PREFIX = 'whsec_';

export type WebhookVerifyFailure =
  | 'missing_signature'
  | 'missing_timestamp'
  | 'invalid_timestamp'
  | 'timestamp_out_of_tolerance'
  | 'signature_mismatch';

export type WebhookVerifyResult = { ok: true; timestamp: number } | { ok: false; reason: WebhookVerifyFailure };

const encoder = new TextEncoder();

function subtle(): SubtleCrypto {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (!c?.subtle) {
    throw new Error('Web Crypto (globalThis.crypto.subtle) is not available in this runtime');
  }
  return c.subtle;
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer), (b) => b.toString(16).padStart(2, '0')).join('');
}

async function hmacHex(secret: string, message: string): Promise<string> {
  if (secret.length === 0) throw new Error('webhook secret must not be empty');
  const key = await subtle().importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
  ]);
  return toHex(await subtle().sign('HMAC', key, encoder.encode(message)));
}

/** Constant-time comparison of two strings of equal length. */
export function timingSafeEqualString(a: string, b: string): boolean {
  const ab = encoder.encode(a);
  const bb = encoder.encode(b);
  let diff = ab.length ^ bb.length;
  const n = Math.max(ab.length, bb.length);
  for (let i = 0; i < n; i++) diff |= (ab[i] ?? 0) ^ (bb[i] ?? 0);
  return diff === 0;
}

export function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

/**
 * Signs a webhook body. Returns the header values to send.
 * `timestamp` defaults to now, in seconds.
 */
export async function signWebhook(
  secret: string,
  rawBody: string,
  timestamp: number = nowSeconds(),
): Promise<{ signature: string; timestamp: string }> {
  if (!Number.isSafeInteger(timestamp) || timestamp < 0) throw new Error('timestamp must be a non-negative integer');
  const hex = await hmacHex(secret, `${timestamp}.${rawBody}`);
  return { signature: `${WEBHOOK_SIGNATURE_VERSION}=${hex}`, timestamp: String(timestamp) };
}

export interface VerifyWebhookInput {
  /** One secret, or several while a rotation is in progress. */
  secret: string | readonly string[];
  rawBody: string;
  signatureHeader: string | null | undefined;
  timestampHeader: string | null | undefined;
  /** Current Unix time in seconds; defaults to the clock. */
  now?: number;
  toleranceSeconds?: number;
}

/**
 * Verifies a webhook request. Never throws for a bad request, only reports why
 * it failed; a receiver answers any failure with 400 or 401 and does not process
 * the body.
 */
export async function verifyWebhook(input: VerifyWebhookInput): Promise<WebhookVerifyResult> {
  const { rawBody, signatureHeader, timestampHeader } = input;
  if (!signatureHeader) return { ok: false, reason: 'missing_signature' };
  if (!timestampHeader) return { ok: false, reason: 'missing_timestamp' };
  if (!/^\d{1,12}$/.test(timestampHeader)) return { ok: false, reason: 'invalid_timestamp' };
  const timestamp = Number(timestampHeader);
  const now = input.now ?? nowSeconds();
  const tolerance = input.toleranceSeconds ?? WEBHOOK_TOLERANCE_SECONDS;
  if (Math.abs(now - timestamp) > tolerance) return { ok: false, reason: 'timestamp_out_of_tolerance' };

  const candidates = signatureHeader
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.startsWith(`${WEBHOOK_SIGNATURE_VERSION}=`))
    .map((part) => part.slice(WEBHOOK_SIGNATURE_VERSION.length + 1));
  if (candidates.length === 0) return { ok: false, reason: 'missing_signature' };

  const secrets = typeof input.secret === 'string' ? [input.secret] : input.secret;
  let matched = false;
  for (const secret of secrets) {
    if (secret.length === 0) continue;
    const expected = await hmacHex(secret, `${timestampHeader}.${rawBody}`);
    for (const candidate of candidates) {
      // Evaluate every pair so the time taken does not reveal which one matched.
      if (timingSafeEqualString(expected, candidate)) matched = true;
    }
  }
  return matched ? { ok: true, timestamp } : { ok: false, reason: 'signature_mismatch' };
}
