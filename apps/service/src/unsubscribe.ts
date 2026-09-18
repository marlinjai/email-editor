import { createHmac, timingSafeEqual } from 'node:crypto';
import type { UnsubscribeToken, UnsubscribeTokenClaims } from '@marlinjai/mail-contract';
import { z } from 'zod';

/**
 * Unsubscribe tokens, in the wire layout `@marlinjai/mail-contract` documents:
 *
 *   base64url(JSON(claims)) + "." + base64url(HMAC-SHA256(key, base64url(JSON(claims))))
 *
 * keyed with MAIL_UNSUBSCRIBE_KEY. The claims bind workspace, contact, mailing
 * and topic, so a token opens exactly one person's preferences in one workspace.
 * Tokens never expire (an old email must keep working).
 *
 * Keys are versioned like MAIL_SECRETS_KEY: a new token is signed with the
 * highest version, and a token verifies under any version still held. The
 * contract's claims carry no key id, so verification tries each held key, in
 * constant time per key.
 */

export type UnsubscribeKeys = ReadonlyMap<number, Buffer>;

const Claims = z
  .object({
    v: z.literal(1),
    workspace_id: z.string().min(1).max(64),
    contact_id: z.string().min(1).max(64),
    mailing_id: z.string().min(1).max(64).nullable(),
    topic_id: z.string().min(1).max(64).nullable(),
    iat: z.number().int().min(0),
  })
  .strict();

/** Longer than any honest token; refused before any work is done. */
const MAX_TOKEN_LENGTH = 1024;

export class UnsubscribeKeyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsubscribeKeyError';
  }
}

export type UnsubscribeSigner = {
  sign(claims: Omit<UnsubscribeTokenClaims, 'v' | 'iat'> & { iat?: number }): UnsubscribeToken;
  /** The claims of a genuine token, or null for anything else (tampered, malformed, unknown key). Never throws. */
  verify(token: string): UnsubscribeTokenClaims | null;
};

function mac(key: Buffer, payload: string): Buffer {
  return createHmac('sha256', key).update(payload).digest();
}

export function createUnsubscribeSigner(keys: UnsubscribeKeys): UnsubscribeSigner {
  if (keys.size === 0) throw new UnsubscribeKeyError('no unsubscribe key configured');
  for (const [version, key] of keys) {
    if (key.length !== 32) throw new UnsubscribeKeyError(`unsubscribe key v${version} must be 32 bytes`);
  }
  const current = keys.get(Math.max(...keys.keys()))!;
  // Newest first: the common case verifies on the first try.
  const ordered = [...keys.entries()].sort((a, b) => b[0] - a[0]).map(([, k]) => k);

  return {
    sign(input) {
      const claims: UnsubscribeTokenClaims = Claims.parse({
        v: 1,
        workspace_id: input.workspace_id,
        contact_id: input.contact_id,
        mailing_id: input.mailing_id,
        topic_id: input.topic_id,
        iat: input.iat ?? Math.floor(Date.now() / 1000),
      });
      const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
      return `${payload}.${mac(current, payload).toString('base64url')}` as UnsubscribeToken;
    },

    verify(token) {
      if (typeof token !== 'string' || token.length > MAX_TOKEN_LENGTH) return null;
      const match = /^([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/.exec(token);
      if (!match) return null;
      const [, payload, signature] = match as unknown as [string, string, string];
      const given = Buffer.from(signature, 'base64url');
      // Canonical encoding only, so one token has exactly one spelling.
      if (given.toString('base64url') !== signature || given.length !== 32) return null;
      const genuine = ordered.some((key) => timingSafeEqual(mac(key, payload), given));
      if (!genuine) return null;
      try {
        const parsed = Claims.safeParse(JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')));
        return parsed.success ? parsed.data : null;
      } catch {
        return null;
      }
    },
  };
}
