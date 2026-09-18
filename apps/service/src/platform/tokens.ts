import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Signed tokens for the S4 hosted endpoints (signup form render time, signup
 * confirmation, open pixel, click redirect) and the address hashes of consent
 * records and rate limits.
 *
 * Every purpose gets its own key, derived from MAIL_UNSUBSCRIBE_KEY with
 * HMAC-SHA256 over a purpose label, so a token minted for one purpose never
 * verifies for another (an open-pixel token is not a confirmation link), and
 * no new secret has to be provisioned. Versioned like the unsubscribe key: a
 * token is signed with the highest version and verifies under any version held.
 *
 * Wire layout: `v<version>.<base64url(payload)>.<base64url(mac)>`, the mac over
 * `<purpose>.<version>.<payload>`. The payload is compact text chosen by the
 * caller (ids joined by `.`, never JSON with free text), and parsed by the caller
 * after verification.
 */

export type TokenPurpose = 'signup-render' | 'signup-confirm' | 'track-open' | 'track-click' | 'ip-hash';

export type RootKeys = ReadonlyMap<number, Buffer>;

const MAX_TOKEN_LENGTH = 1024;

function derive(root: Buffer, purpose: TokenPurpose): Buffer {
  return createHmac('sha256', root).update(`lumitra-mail/s4/${purpose}`).digest();
}

function b64(buf: Buffer | string): string {
  return Buffer.from(buf).toString('base64url');
}

export type PurposeSigner = {
  sign(payload: string): string;
  /** The payload of a genuine token of this purpose, or null. Never throws. */
  verify(token: string): string | null;
};

export function createPurposeSigner(keys: RootKeys, purpose: TokenPurpose): PurposeSigner {
  if (keys.size === 0) throw new Error('no signing key');
  const derived = new Map([...keys].map(([v, k]) => [v, derive(k, purpose)]));
  const current = Math.max(...derived.keys());
  const mac = (key: Buffer, version: number, payload: string) =>
    createHmac('sha256', key).update(`${purpose}.${version}.${payload}`).digest();

  return {
    sign(payload) {
      return `v${current}.${b64(payload)}.${b64(mac(derived.get(current)!, current, payload))}`;
    },
    verify(token) {
      if (typeof token !== 'string' || token.length > MAX_TOKEN_LENGTH) return null;
      const m = /^v(\d{1,4})\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]{43})$/.exec(token);
      if (!m) return null;
      const version = Number(m[1]);
      const key = derived.get(version);
      if (!key) return null;
      const payload = Buffer.from(m[2]!, 'base64url').toString('utf8');
      if (b64(payload) !== m[2]) return null;
      const given = Buffer.from(m[3]!, 'base64url');
      const expected = mac(key, version, payload);
      return given.length === expected.length && timingSafeEqual(given, expected) ? payload : null;
    },
  };
}

/**
 * A keyed hash of a network address, for rate limits and consent records: the
 * same address always gives the same hash, and the address cannot be read back
 * or confirmed by guessing without the service's key.
 */
export function createAddressHasher(keys: RootKeys): (address: string) => string {
  const current = Math.max(...keys.keys());
  const key = derive(keys.get(current)!, 'ip-hash');
  return (address) => createHmac('sha256', key).update(address.trim().toLowerCase()).digest('base64url');
}
