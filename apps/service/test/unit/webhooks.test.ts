import { verifyWebhook } from '@marlinjai/mail-contract';
import { describe, expect, it } from 'vitest';
import { createSealer } from '../../src/sealing.js';
import { buildWebhookHeaders, validSecretsFor } from '../../src/webhooks/signing.js';
import { generateWebhookSecret, WEBHOOK_SECRET_ROTATION_WINDOW_MS } from '../../src/webhooks/secret.js';
import {
  assertHttpsUnlessDev,
  assertResolvesToPublicAddress,
  isDisallowedAddress,
  SsrfBlockedError,
} from '../../src/webhooks/ssrf.js';

describe('generateWebhookSecret', () => {
  it('is prefixed and long enough to be unguessable, and never repeats', () => {
    const a = generateWebhookSecret();
    const b = generateWebhookSecret();
    expect(a).toMatch(/^whsec_[A-Za-z0-9_-]{32,}$/);
    expect(a).not.toBe(b);
  });
});

describe('assertHttpsUnlessDev', () => {
  it('accepts https always', () => {
    expect(() => assertHttpsUnlessDev('https://example.com/hook')).not.toThrow();
  });

  it('refuses http without the flag, whatever the hostname', () => {
    expect(() => assertHttpsUnlessDev('http://example.com/hook')).toThrow();
    expect(() => assertHttpsUnlessDev('http://127.0.0.1:9/hook')).toThrow();
  });

  it('accepts http with the development flag set', () => {
    expect(() => assertHttpsUnlessDev('http://example.com/hook', { allowInsecureHttp: true })).not.toThrow();
  });
});

describe('isDisallowedAddress', () => {
  it.each([
    ['127.0.0.1', 4],
    ['10.1.2.3', 4],
    ['172.16.0.5', 4],
    ['172.31.255.255', 4],
    ['192.168.1.1', 4],
    ['169.254.1.1', 4],
    ['0.0.0.0', 4],
    ['::1', 6],
    ['fe80::1', 6],
    ['fc00::1', 6],
    ['fd12:3456::1', 6],
    ['::ffff:127.0.0.1', 6],
  ] as const)('blocks %s', (address, family) => {
    expect(isDisallowedAddress(address, family)).toBe(true);
  });

  it.each([
    ['8.8.8.8', 4],
    ['1.1.1.1', 4],
    ['172.32.0.1', 4], // just outside the RFC 1918 172.16.0.0/12 range
    ['2001:4860:4860::8888', 6],
  ] as const)('allows %s', (address, family) => {
    expect(isDisallowedAddress(address, family)).toBe(false);
  });
});

describe('assertResolvesToPublicAddress', () => {
  it('refuses a private literal IP', async () => {
    await expect(assertResolvesToPublicAddress('127.0.0.1')).rejects.toThrow(SsrfBlockedError);
  });

  it('allows a private literal IP when the policy opts in', async () => {
    await expect(assertResolvesToPublicAddress('127.0.0.1', { allowPrivateTargets: true })).resolves.toBeUndefined();
  });

  it('allows a public literal IP without any override', async () => {
    await expect(assertResolvesToPublicAddress('8.8.8.8')).resolves.toBeUndefined();
  });
});

describe('validSecretsFor and buildWebhookHeaders', () => {
  const sealer = createSealer(new Map([[1, Buffer.alloc(32, 3)]]));

  it('signs with only the current secret when there is no rotation in progress', () => {
    const secrets = validSecretsFor({
      secret_sealed: sealer.seal('whsec_current'),
      previous_secret_sealed: null,
      previous_secret_expires_at: null,
    }, sealer);
    expect(secrets).toEqual(['whsec_current']);
  });

  it('signs with both secrets during the rotation window, and drops the old one once it expires', () => {
    const now = new Date('2026-01-01T00:00:00Z');
    const withinWindow = validSecretsFor(
      {
        secret_sealed: sealer.seal('whsec_new'),
        previous_secret_sealed: sealer.seal('whsec_old'),
        previous_secret_expires_at: new Date(now.getTime() + WEBHOOK_SECRET_ROTATION_WINDOW_MS).toISOString(),
      },
      sealer,
      now,
    );
    expect(withinWindow.sort()).toEqual(['whsec_new', 'whsec_old'].sort());

    const afterWindow = validSecretsFor(
      {
        secret_sealed: sealer.seal('whsec_new'),
        previous_secret_sealed: sealer.seal('whsec_old'),
        previous_secret_expires_at: new Date(now.getTime() - 1).toISOString(),
      },
      sealer,
      now,
    );
    expect(afterWindow).toEqual(['whsec_new']);
  });

  it('produces headers a receiver verifies with any one of the signing secrets', async () => {
    const event = {
      id: 'evt_1',
      type: 'contact.unsubscribed' as const,
      created_at: new Date().toISOString(),
      workspace_id: 'ws_1',
      data: {
        contact_id: null,
        external_id: null,
        email: 'a@example.com',
        topic: null,
        mailing_id: null,
        source: 'api' as const,
        unsubscribed_at: new Date().toISOString(),
      },
    };
    const rawBody = JSON.stringify(event);
    const headers = await buildWebhookHeaders(['whsec_old', 'whsec_new'], rawBody, event);
    expect(headers['x-mail-signature']?.split(',')).toHaveLength(2);
    expect(headers['x-mail-event-id']).toBe('evt_1');

    for (const secret of ['whsec_old', 'whsec_new']) {
      const verified = await verifyWebhook({
        secret,
        rawBody,
        signatureHeader: headers['x-mail-signature'],
        timestampHeader: headers['x-mail-timestamp'],
      });
      expect(verified.ok, secret).toBe(true);
    }
    const wrong = await verifyWebhook({
      secret: 'whsec_wrong',
      rawBody,
      signatureHeader: headers['x-mail-signature'],
      timestampHeader: headers['x-mail-timestamp'],
    });
    expect(wrong.ok).toBe(false);
  });
});
