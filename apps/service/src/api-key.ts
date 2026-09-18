import { API_KEY_PREFIX_LIVE, generateApiKey, hashApiKey, timingSafeEqual, verifyApiKey } from '@marlinjai/brain-core';

/**
 * Workspace API keys, on the suite's shared primitives in `@marlinjai/brain-core`:
 * `sk_live_` followed by 24 random bytes in base64url, stored only as SHA-256.
 */

/** sk_live_ + 32 base64url characters. */
const KEY_PATTERN = /^sk_live_[A-Za-z0-9_-]{32}$/;

/** Characters of the key kept for display, enough to tell keys apart in a list, far too few to guess from. */
export const DISPLAY_PREFIX_LENGTH = API_KEY_PREFIX_LIVE.length + 4;

export type MintedKey = { key: string; prefix: string; hash: string };

export async function mintApiKey(): Promise<MintedKey> {
  const key = generateApiKey();
  return { key, prefix: key.slice(0, DISPLAY_PREFIX_LENGTH), hash: await hashApiKey(key) };
}

export function looksLikeApiKey(value: string): boolean {
  return KEY_PATTERN.test(value);
}

export { hashApiKey, verifyApiKey, timingSafeEqual };
