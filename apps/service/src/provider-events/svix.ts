import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Svix's webhook signature scheme, which Resend signs its events with
 * (https://docs.svix.com/receiving/verifying-payloads/how-manual):
 *
 * - the secret is `whsec_` followed by the base64 of the key;
 * - the signed content is `${svix-id}.${svix-timestamp}.${raw body}`;
 * - the signature is the base64 HMAC-SHA256 of it, sent in `svix-signature`
 *   as space-separated `v1,<base64>` entries (more than one during a secret
 *   rotation), any of which may match;
 * - `svix-timestamp` is in seconds and must be within the tolerance of now,
 *   so a captured request cannot be replayed later.
 */

/** Svix's own default: five minutes either way. */
export const SVIX_TOLERANCE_SECONDS = 5 * 60;

export type SvixHeaders = { id: string | undefined; timestamp: string | undefined; signature: string | undefined };

export type SvixVerdict = { ok: true } | { ok: false; reason: 'missing_headers' | 'stale_timestamp' | 'bad_signature' };

export function svixKey(secret: string): Buffer {
  return Buffer.from(secret.startsWith('whsec_') ? secret.slice('whsec_'.length) : secret, 'base64');
}

/** The `v1,<base64>` signature of a payload; how Svix signs, and how tests sign. */
export function svixSign(secret: string, id: string, timestamp: string, body: string): string {
  const digest = createHmac('sha256', svixKey(secret)).update(`${id}.${timestamp}.${body}`).digest('base64');
  return `v1,${digest}`;
}

export function verifySvix(secret: string, headers: SvixHeaders, body: string, nowSeconds = Math.floor(Date.now() / 1000)): SvixVerdict {
  const { id, timestamp, signature } = headers;
  if (!id || !timestamp || !signature) return { ok: false, reason: 'missing_headers' };
  if (!/^\d{1,12}$/.test(timestamp)) return { ok: false, reason: 'stale_timestamp' };
  if (Math.abs(nowSeconds - Number(timestamp)) > SVIX_TOLERANCE_SECONDS) return { ok: false, reason: 'stale_timestamp' };
  const expected = Buffer.from(svixSign(secret, id, timestamp, body).slice('v1,'.length), 'base64');
  for (const entry of signature.split(' ')) {
    const [version, value] = entry.split(',', 2);
    if (version !== 'v1' || !value) continue;
    const given = Buffer.from(value, 'base64');
    if (given.length === expected.length && timingSafeEqual(given, expected)) return { ok: true };
  }
  return { ok: false, reason: 'bad_signature' };
}
