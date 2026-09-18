import { describe, expect, it } from 'vitest';
import { DISPLAY_PREFIX_LENGTH, hashApiKey, looksLikeApiKey, mintApiKey, verifyApiKey } from '../../src/api-key.js';

describe('API keys', () => {
  it('mints sk_live_ keys with a display prefix and a SHA-256 hash', async () => {
    const minted = await mintApiKey();
    expect(minted.key).toMatch(/^sk_live_[A-Za-z0-9_-]{32}$/);
    expect(minted.prefix).toBe(minted.key.slice(0, DISPLAY_PREFIX_LENGTH));
    expect(minted.prefix).toHaveLength(12);
    expect(minted.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(minted.hash).toBe(await hashApiKey(minted.key));
  });

  it('never mints the same key twice', async () => {
    const keys = await Promise.all(Array.from({ length: 200 }, () => mintApiKey()));
    expect(new Set(keys.map((k) => k.key)).size).toBe(200);
  });

  it('verifies only the key that produced the hash', async () => {
    const a = await mintApiKey();
    const b = await mintApiKey();
    expect(await verifyApiKey(a.key, a.hash)).toBe(true);
    expect(await verifyApiKey(b.key, a.hash)).toBe(false);
    expect(await verifyApiKey(a.key.slice(0, -1) + (a.key.endsWith('A') ? 'B' : 'A'), a.hash)).toBe(false);
  });

  it('recognises the format and rejects everything else', async () => {
    expect(looksLikeApiKey((await mintApiKey()).key)).toBe(true);
    for (const bad of ['', 'sk_live_', 'sk_test_' + 'a'.repeat(32), 'sk_live_' + 'a'.repeat(31), 'sk_live_' + 'a'.repeat(33), 'ek_free_abc', 'sk_live_' + 'a'.repeat(31) + '!']) {
      expect(looksLikeApiKey(bad), bad).toBe(false);
    }
  });
});
