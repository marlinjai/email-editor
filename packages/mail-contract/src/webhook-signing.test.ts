import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  WEBHOOK_TOLERANCE_SECONDS,
  signWebhook,
  timingSafeEqualString,
  verifyWebhook,
} from './webhook-signing';

const secret = 'whsec_test_0123456789abcdef0123456789abcdef';
const body = JSON.stringify({ id: 'evt_1', type: 'message.sent', data: { email: 'a@b.de' } });
const t = 1_789_000_000;

describe('signWebhook', () => {
  it('is HMAC-SHA256 over `${timestamp}.${rawBody}`, hex, with a v1= prefix', async () => {
    const { signature, timestamp } = await signWebhook(secret, body, t);
    const expected = createHmac('sha256', secret).update(`${t}.${body}`).digest('hex');
    expect(signature).toBe(`v1=${expected}`);
    expect(timestamp).toBe(String(t));
  });

  it('refuses an empty secret and a bad timestamp', async () => {
    await expect(signWebhook('', body, t)).rejects.toThrow();
    await expect(signWebhook(secret, body, -1)).rejects.toThrow();
    await expect(signWebhook(secret, body, 1.5)).rejects.toThrow();
  });
});

describe('verifyWebhook', () => {
  it('accepts a correctly signed request within the tolerance', async () => {
    const s = await signWebhook(secret, body, t);
    const r = await verifyWebhook({ secret, rawBody: body, signatureHeader: s.signature, timestampHeader: s.timestamp, now: t + 10 });
    expect(r).toEqual({ ok: true, timestamp: t });
  });

  it('rejects a tampered body', async () => {
    const s = await signWebhook(secret, body, t);
    const r = await verifyWebhook({
      secret,
      rawBody: body.replace('a@b.de', 'x@b.de'),
      signatureHeader: s.signature,
      timestampHeader: s.timestamp,
      now: t,
    });
    expect(r).toEqual({ ok: false, reason: 'signature_mismatch' });
  });

  it('rejects the right body under a wrong secret', async () => {
    const s = await signWebhook('whsec_someone_else', body, t);
    const r = await verifyWebhook({ secret, rawBody: body, signatureHeader: s.signature, timestampHeader: s.timestamp, now: t });
    expect(r).toEqual({ ok: false, reason: 'signature_mismatch' });
  });

  it('rejects a stale timestamp, and one from too far in the future', async () => {
    const s = await signWebhook(secret, body, t);
    const input = { secret, rawBody: body, signatureHeader: s.signature, timestampHeader: s.timestamp };
    expect(await verifyWebhook({ ...input, now: t + WEBHOOK_TOLERANCE_SECONDS })).toEqual({ ok: true, timestamp: t });
    expect(await verifyWebhook({ ...input, now: t + WEBHOOK_TOLERANCE_SECONDS + 1 })).toEqual({
      ok: false,
      reason: 'timestamp_out_of_tolerance',
    });
    expect(await verifyWebhook({ ...input, now: t - WEBHOOK_TOLERANCE_SECONDS - 1 })).toEqual({
      ok: false,
      reason: 'timestamp_out_of_tolerance',
    });
  });

  it('rejects a replayed signature under a moved timestamp', async () => {
    const s = await signWebhook(secret, body, t);
    const r = await verifyWebhook({ secret, rawBody: body, signatureHeader: s.signature, timestampHeader: String(t + 1), now: t });
    expect(r).toEqual({ ok: false, reason: 'signature_mismatch' });
  });

  it('reports missing and malformed headers', async () => {
    const s = await signWebhook(secret, body, t);
    const base = { secret, rawBody: body, now: t };
    expect(await verifyWebhook({ ...base, signatureHeader: null, timestampHeader: s.timestamp })).toEqual({
      ok: false,
      reason: 'missing_signature',
    });
    expect(await verifyWebhook({ ...base, signatureHeader: s.signature, timestampHeader: undefined })).toEqual({
      ok: false,
      reason: 'missing_timestamp',
    });
    expect(await verifyWebhook({ ...base, signatureHeader: s.signature, timestampHeader: '12abc' })).toEqual({
      ok: false,
      reason: 'invalid_timestamp',
    });
    expect(await verifyWebhook({ ...base, signatureHeader: 'v0=deadbeef', timestampHeader: s.timestamp })).toEqual({
      ok: false,
      reason: 'missing_signature',
    });
    expect(await verifyWebhook({ ...base, signatureHeader: 'v1=', timestampHeader: s.timestamp })).toEqual({
      ok: false,
      reason: 'signature_mismatch',
    });
  });

  it('accepts either secret during a rotation, and any one of several signatures', async () => {
    const oldS = await signWebhook('whsec_old', body, t);
    const newS = await signWebhook(secret, body, t);
    const both = `${oldS.signature}, ${newS.signature}`;
    expect(
      (await verifyWebhook({ secret: [secret], rawBody: body, signatureHeader: both, timestampHeader: String(t), now: t })).ok,
    ).toBe(true);
    expect(
      (await verifyWebhook({ secret: ['whsec_old', secret], rawBody: body, signatureHeader: oldS.signature, timestampHeader: String(t), now: t }))
        .ok,
    ).toBe(true);
    expect(
      (await verifyWebhook({ secret: [], rawBody: body, signatureHeader: both, timestampHeader: String(t), now: t })).ok,
    ).toBe(false);
  });

  it('handles non-ASCII bodies byte for byte', async () => {
    const umlauts = JSON.stringify({ name: 'ŌPUNTIA Grüße' });
    const s = await signWebhook(secret, umlauts, t);
    const expected = createHmac('sha256', secret).update(`${t}.${umlauts}`, 'utf8').digest('hex');
    expect(s.signature).toBe(`v1=${expected}`);
    expect((await verifyWebhook({ secret, rawBody: umlauts, signatureHeader: s.signature, timestampHeader: s.timestamp, now: t })).ok).toBe(
      true,
    );
  });
});

describe('timingSafeEqualString', () => {
  it('compares equal, different and different-length strings', () => {
    expect(timingSafeEqualString('abc', 'abc')).toBe(true);
    expect(timingSafeEqualString('abc', 'abd')).toBe(false);
    expect(timingSafeEqualString('abc', 'abcd')).toBe(false);
    expect(timingSafeEqualString('', '')).toBe(true);
  });
});
