import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createUnsubscribeSigner, UnsubscribeKeyError } from '../../src/unsubscribe.js';

const K1 = Buffer.alloc(32, 1);
const K2 = Buffer.alloc(32, 2);
const claims = {
  workspace_id: 'ws-1',
  contact_id: 'c-1',
  mailing_id: 'm-1',
  topic_id: 't-1',
};

function flipLastChar(s: string): string {
  const last = s.at(-1)!;
  return s.slice(0, -1) + (last === 'A' ? 'B' : 'A');
}

describe('unsubscribe tokens', () => {
  const signer = createUnsubscribeSigner(new Map([[1, K1]]));

  it('round-trips the claims (forward)', () => {
    const token = signer.sign({ ...claims, iat: 1_700_000_000 });
    expect(signer.verify(token)).toEqual({ v: 1, ...claims, iat: 1_700_000_000 });
  });

  it('carries null mailing and topic (a test send, or every topic)', () => {
    const token = signer.sign({ ...claims, mailing_id: null, topic_id: null });
    const out = signer.verify(token)!;
    expect(out.mailing_id).toBeNull();
    expect(out.topic_id).toBeNull();
    expect(out.iat).toBeGreaterThan(1_700_000_000);
  });

  it('follows the contract layout: base64url(JSON(claims)).base64url(HMAC-SHA256)', () => {
    const token = signer.sign({ ...claims, iat: 1 });
    const [payload, sig] = token.split('.');
    expect(JSON.parse(Buffer.from(payload!, 'base64url').toString())).toEqual({ v: 1, ...claims, iat: 1 });
    expect(Buffer.from(sig!, 'base64url')).toHaveLength(32);
  });

  it('refuses a token whose claims were changed (another contact)', () => {
    const token = signer.sign(claims);
    const [, sig] = token.split('.');
    const forged = Buffer.from(JSON.stringify({ v: 1, ...claims, contact_id: 'c-2', iat: 1 })).toString('base64url');
    expect(signer.verify(`${forged}.${sig}`)).toBeNull();
  });

  it('refuses a tampered signature', () => {
    expect(signer.verify(flipLastChar(signer.sign(claims)))).toBeNull();
  });

  it('refuses a token signed with another key', () => {
    const other = createUnsubscribeSigner(new Map([[1, K2]]));
    expect(signer.verify(other.sign(claims))).toBeNull();
  });

  it('keeps honouring a token signed under a retired key version, and signs with the newest', () => {
    const old = signer.sign(claims);
    const rotated = createUnsubscribeSigner(new Map([[1, K1], [2, K2]]));
    expect(rotated.verify(old)?.contact_id).toBe('c-1');
    const fresh = rotated.sign(claims);
    expect(signer.verify(fresh)).toBeNull();
    expect(createUnsubscribeSigner(new Map([[2, K2]])).verify(fresh)?.contact_id).toBe('c-1');
  });

  it('returns null, never throws, for malformed input', () => {
    for (const bad of ['', '.', 'abc', 'a.b.c', 'no dots here', '%%%.%%%', 'x'.repeat(5000), `${'a'.repeat(10)}.${'b'.repeat(43)}`]) {
      expect(signer.verify(bad)).toBeNull();
    }
    expect(signer.verify(undefined as unknown as string)).toBeNull();
  });

  it('refuses a genuinely signed payload that is not valid claims', () => {
    // Sign something that is not a claims object with the same HMAC construction.
    const payload = Buffer.from(JSON.stringify({ v: 2, hello: 'world' })).toString('base64url');
    const sig = createHmac('sha256', K1).update(payload).digest('base64url');
    expect(signer.verify(`${payload}.${sig}`)).toBeNull();
  });

  it('refuses to start without a usable key', () => {
    expect(() => createUnsubscribeSigner(new Map())).toThrow(UnsubscribeKeyError);
    expect(() => createUnsubscribeSigner(new Map([[1, Buffer.alloc(16)]]))).toThrow(/32 bytes/);
  });

  it('refuses to sign incomplete claims', () => {
    expect(() => signer.sign({ ...claims, contact_id: '' })).toThrow();
  });
});
