import { describe, expect, it } from 'vitest';
import {
  WEBHOOK_EVENT_TYPES,
  WEBHOOK_MAX_ATTEMPTS,
  WEBHOOK_RETRY_DELAYS_SECONDS,
  WebhookDelivery,
  WebhookEndpointCreate,
  WebhookEndpointUpdate,
  WebhookEndpointWithSecret,
  WebhookEvent,
} from './webhooks';
import { TS, counts } from './test-fixtures';

const env = { id: 'evt_1', created_at: TS, workspace_id: 'ws_1' };
const messageBase = {
  message_id: 'msg_1',
  mailing_id: 'mlg_1',
  mailing_metadata: { sent_by: 'person_1' },
  recipient_id: 'rcp_1',
  contact_id: 'ctc_1',
  external_id: 'person_1',
  email: 'a@b.de',
  subject: 'Hello',
  topic: 'programme-updates',
  provider_message_id: '<x@y>',
  is_test: false,
};

const samples = {
  'message.sent': { ...messageBase, html: '<html/>', sent_at: TS },
  'message.failed': { ...messageBase, error: '550 mailbox unavailable', retryable: false, failed_at: TS },
  'contact.unsubscribed': {
    contact_id: 'ctc_1',
    external_id: 'person_1',
    email: 'a@b.de',
    topic: null,
    mailing_id: 'mlg_1',
    source: 'one_click',
    unsubscribed_at: TS,
  },
  'contact.resubscribed': {
    contact_id: 'ctc_1',
    external_id: 'person_1',
    email: 'a@b.de',
    topic: 'programme-updates',
    mailing_id: null,
    source: 'hosted_page',
    resubscribed_at: TS,
  },
  'contact.bounced': {
    contact_id: null,
    external_id: null,
    email: 'a@b.de',
    reason: 'bounced',
    message_id: 'msg_1',
    diagnostic: null,
    bounced_at: TS,
  },
  'mailing.finished': { mailing_id: 'mlg_1', mailing_metadata: {}, status: 'partially_failed', counts, finished_at: TS },
} as const;

describe('webhook events', () => {
  it('has a sample for every event type, and each parses', () => {
    expect(Object.keys(samples).sort()).toEqual([...WEBHOOK_EVENT_TYPES].sort());
    for (const type of WEBHOOK_EVENT_TYPES) {
      const parsed = WebhookEvent.safeParse({ ...env, type, data: samples[type] });
      expect(parsed.success, type).toBe(true);
    }
  });

  it('rejects an unknown type and a payload under the wrong type', () => {
    expect(WebhookEvent.safeParse({ ...env, type: 'message.opened', data: samples['message.sent'] }).success).toBe(false);
    expect(WebhookEvent.safeParse({ ...env, type: 'message.sent', data: samples['message.failed'] }).success).toBe(false);
    expect(WebhookEvent.safeParse({ ...env, type: 'mailing.finished', data: samples['contact.bounced'] }).success).toBe(false);
  });

  it('rejects an envelope without id or workspace', () => {
    const { id: _id, ...noId } = env;
    expect(WebhookEvent.safeParse({ ...noId, type: 'message.sent', data: samples['message.sent'] }).success).toBe(false);
    expect(
      WebhookEvent.safeParse({ ...env, workspace_id: '', type: 'message.sent', data: samples['message.sent'] }).success,
    ).toBe(false);
  });

  it('mailing.finished only reports a final status', () => {
    const data = { ...samples['mailing.finished'], status: 'sending' };
    expect(WebhookEvent.safeParse({ ...env, type: 'mailing.finished', data }).success).toBe(false);
  });

  it('contact.resubscribed mirrors contact.unsubscribed, with its own timestamp', () => {
    const { resubscribed_at: _at, ...rest } = samples['contact.resubscribed'];
    const wrongStamp = { ...rest, unsubscribed_at: TS };
    expect(WebhookEvent.safeParse({ ...env, type: 'contact.resubscribed', data: wrongStamp }).success).toBe(false);
    expect(WebhookEvent.safeParse({ ...env, type: 'contact.resubscribed', data: { ...rest, resubscribed_at: TS, topic: null } }).success).toBe(true);
    const unsubscribedKeys = Object.keys(samples['contact.unsubscribed']).filter((k) => k !== 'unsubscribed_at').sort();
    expect(Object.keys(rest).sort()).toEqual(unsubscribedKeys);
  });

  it('narrows by type', () => {
    const e = WebhookEvent.parse({ ...env, type: 'contact.unsubscribed', data: samples['contact.unsubscribed'] });
    if (e.type === 'contact.unsubscribed') expect(e.data.source).toBe('one_click');
    else throw new Error('did not narrow');
  });
});

describe('webhook endpoints', () => {
  it('requires https, except for localhost', () => {
    expect(WebhookEndpointCreate.safeParse({ url: 'https://opuntia.example/api/mail/webhook', events: ['message.sent'] }).success).toBe(
      true,
    );
    expect(WebhookEndpointCreate.safeParse({ url: 'http://localhost:3000/hook', events: ['message.sent'] }).success).toBe(true);
    expect(WebhookEndpointCreate.safeParse({ url: 'http://opuntia.example/hook', events: ['message.sent'] }).success).toBe(false);
    expect(WebhookEndpointCreate.safeParse({ url: 'ftp://x.de/hook', events: ['message.sent'] }).success).toBe(false);
    expect(WebhookEndpointCreate.safeParse({ url: 'not a url', events: ['message.sent'] }).success).toBe(false);
  });

  it('subscribes to at least one known event', () => {
    expect(WebhookEndpointCreate.safeParse({ url: 'https://x.de/h', events: [] }).success).toBe(false);
    expect(WebhookEndpointCreate.safeParse({ url: 'https://x.de/h', events: ['message.clicked'] }).success).toBe(false);
    expect(WebhookEndpointUpdate.safeParse({}).success).toBe(false);
    expect(WebhookEndpointUpdate.safeParse({ enabled: false }).success).toBe(true);
  });

  it('shows the secret only in the create or rotate response', () => {
    const endpoint = {
      id: 'wh_1',
      url: 'https://x.de/h',
      description: null,
      events: ['message.sent'],
      enabled: true,
      created_at: TS,
      updated_at: TS,
    };
    expect(WebhookEndpointWithSecret.safeParse({ endpoint, secret: 'whsec_' + 'a'.repeat(32) }).success).toBe(true);
    expect(WebhookEndpointWithSecret.safeParse({ endpoint, secret: 'short' }).success).toBe(false);
  });
});

describe('webhook deliveries', () => {
  it('retry schedule matches the attempt count', () => {
    expect(WEBHOOK_RETRY_DELAYS_SECONDS.length).toBe(WEBHOOK_MAX_ATTEMPTS - 1);
  });

  it('accepts a delivery and rejects an impossible status code', () => {
    const d = {
      id: 'dlv_1',
      endpoint_id: 'wh_1',
      event_id: 'evt_1',
      event_type: 'message.sent',
      status: 'failed',
      attempts: 8,
      last_status_code: 500,
      last_error: 'Internal Server Error',
      next_attempt_at: null,
      delivered_at: null,
      created_at: TS,
    };
    expect(WebhookDelivery.safeParse(d).success).toBe(true);
    expect(WebhookDelivery.safeParse({ ...d, last_status_code: 42 }).success).toBe(false);
    expect(WebhookDelivery.safeParse({ ...d, status: 'lost' }).success).toBe(false);
  });
});
