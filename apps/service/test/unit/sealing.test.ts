import { describe, expect, it } from 'vitest';
import { createSealer, SealingError } from '../../src/sealing.js';

const k1 = Buffer.alloc(32, 1);
const k2 = Buffer.alloc(32, 2);

describe('sealing', () => {
  it('round-trips, and never repeats a ciphertext for the same plaintext', () => {
    const s = createSealer(new Map([[1, k1]]));
    const a = s.seal('{"key":"sk_live_secret"}');
    const b = s.seal('{"key":"sk_live_secret"}');
    expect(a).not.toBe(b);
    expect(a).not.toContain('sk_live_secret');
    expect(s.open(a)).toBe('{"key":"sk_live_secret"}');
    expect(s.open(s.seal(''))).toBe('');
  });

  it('seals with the newest key and still opens values sealed with an older one', () => {
    const old = createSealer(new Map([[1, k1]])).seal('before rotation');
    const rotated = createSealer(new Map([[1, k1], [2, k2]]));
    expect(rotated.open(old)).toBe('before rotation');
    expect(rotated.seal('after').startsWith('sealed:v2:')).toBe(true);
  });

  it('refuses a tampered value, a wrong key and an unknown key version', () => {
    const s = createSealer(new Map([[1, k1]]));
    const sealed = s.seal('payload');
    const parts = sealed.split(':');
    const flipped = Buffer.from(parts[3]!, 'base64');
    flipped[0] = flipped[0]! ^ 1;
    parts[3] = flipped.toString('base64');
    expect(() => s.open(parts.join(':'))).toThrow(SealingError);
    expect(() => createSealer(new Map([[1, k2]])).open(sealed)).toThrow(/failed authentication/);
    expect(() => createSealer(new Map([[3, k1]])).open(sealed)).toThrow(/v1/);
    expect(() => s.open('plain text')).toThrow(/not a sealed value/);
  });

  it('refuses a key that is not 32 bytes', () => {
    expect(() => createSealer(new Map([[1, Buffer.alloc(16)]]))).toThrow(/32 bytes/);
    expect(() => createSealer(new Map())).toThrow(/no secrets key/);
  });
});
