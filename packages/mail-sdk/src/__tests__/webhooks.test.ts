import { describe, expect, it } from 'vitest';
import {
  WEBHOOK_SIGNATURE_HEADER,
  WEBHOOK_TIMESTAMP_HEADER,
  WebhookEvent,
  signWebhook,
  verifyWebhook,
} from '../index';

describe('webhook helpers re-exported for receivers', () => {
  it('verifies a signature produced by signWebhook, end to end', async () => {
    const secret = 'whsec_test_secret';
    const rawBody = JSON.stringify({
      id: 'evt_1',
      type: 'mailing.finished',
      created_at: '2026-09-18T12:00:00.000Z',
      workspace_id: 'wrk_1',
      data: {
        mailing_id: 'mlg_1',
        mailing_metadata: {},
        status: 'sent',
        counts: { total: 1, queued: 0, sending: 0, sent: 1, failed: 0, skipped: 0 },
        finished_at: '2026-09-18T12:05:00.000Z',
      },
    });
    const { signature, timestamp } = await signWebhook(secret, rawBody);

    const check = await verifyWebhook({
      secret,
      rawBody,
      signatureHeader: signature,
      timestampHeader: timestamp,
    });

    expect(check.ok).toBe(true);
    const event = WebhookEvent.parse(JSON.parse(rawBody));
    expect(event.type).toBe('mailing.finished');
  });

  it('rejects a wrong secret', async () => {
    const rawBody = '{}';
    const { signature, timestamp } = await signWebhook('whsec_a', rawBody);
    const check = await verifyWebhook({ secret: 'whsec_b', rawBody, signatureHeader: signature, timestampHeader: timestamp });
    expect(check.ok).toBe(false);
  });

  it('exposes the header name constants a receiver reads', () => {
    expect(WEBHOOK_SIGNATURE_HEADER).toBe('x-mail-signature');
    expect(WEBHOOK_TIMESTAMP_HEADER).toBe('x-mail-timestamp');
  });
});
