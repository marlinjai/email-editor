import { describe, expect, it } from 'vitest';
import { ICLOUD_SMTP_POLICY, Provider, ProviderCreate, ProviderEventsSecret, ProviderPolicy, ProviderUpdate } from './providers';
import {
  Contact,
  ContactErased,
  ContactUpsert,
  Suppression,
  SuppressionCreate,
  Topic,
  TopicCreate,
  TopicUpdate,
} from './contacts';
import { TS, contact, smtpProvider } from './test-fixtures';

const resendEvents = {
  status: 'active',
  source: 'automatic',
  url: 'https://mail.lumitra.co/providers/prv_2/events/resend',
  error: null,
};

describe('providers', () => {
  it('reads an smtp provider without its password', () => {
    const parsed = Provider.parse({ ...smtpProvider, config: { ...smtpProvider.config, password: 'secret' } });
    expect(parsed.config).not.toHaveProperty('password');
    expect(parsed.has_secret).toBe(true);
  });

  it('reads a resend provider without its api key', () => {
    const resend = { ...smtpProvider, id: 'prv_2', kind: 'resend', config: { api_key: 're_x' }, events: resendEvents };
    const parsed = Provider.parse(resend);
    expect(parsed.config).not.toHaveProperty('api_key');
  });

  it('a resend provider says where its events arrive; an smtp provider has no events', () => {
    const resend = { ...smtpProvider, id: 'prv_2', kind: 'resend', config: {} };
    expect(Provider.safeParse(resend).success).toBe(false);
    expect(Provider.safeParse({ ...resend, events: resendEvents }).success).toBe(true);
    expect(Provider.safeParse({ ...resend, events: { ...resendEvents, status: 'pending' } }).success).toBe(false);
    const parsed = Provider.parse({ ...smtpProvider, events: resendEvents });
    expect(parsed).not.toHaveProperty('events');
  });

  it('counts rejections the sender is at fault for, on every kind', () => {
    const { rejections: _r, ...without } = smtpProvider;
    expect(Provider.safeParse(without).success).toBe(false);
    const rejected = { count: 3, last_error: '550 5.7.1 blocked', last_at: TS };
    expect(Provider.parse({ ...smtpProvider, rejections: rejected }).rejections).toEqual(rejected);
    expect(Provider.safeParse({ ...smtpProvider, rejections: { ...rejected, count: -1 } }).success).toBe(false);
  });

  it('accepts only a Resend signing secret for the events', () => {
    // Built at run time: no secret-shaped literal lives in the repository.
    const minted = `whsec_${Buffer.from(Array.from({ length: 24 }, (_, i) => i)).toString('base64')}`;
    expect(ProviderEventsSecret.safeParse({ signing_secret: minted }).success).toBe(true);
    expect(ProviderEventsSecret.safeParse({ signing_secret: 're_123456789012345678' }).success).toBe(false);
    expect(ProviderEventsSecret.safeParse({ signing_secret: 'whsec_short' }).success).toBe(false);
    expect(ProviderEventsSecret.safeParse({}).success).toBe(false);
  });

  it('creating smtp requires the password; creating resend requires the api key', () => {
    const { id: _i, has_secret: _h, created_at: _c, updated_at: _u, ...base } = smtpProvider;
    expect(ProviderCreate.safeParse({ ...base, config: { ...base.config, password: 'p' } }).success).toBe(true);
    expect(ProviderCreate.safeParse(base).success).toBe(false);
    expect(ProviderCreate.safeParse({ ...base, kind: 'resend', config: { api_key: 're_x' } }).success).toBe(true);
    expect(ProviderCreate.safeParse({ ...base, kind: 'resend', config: {} }).success).toBe(false);
    expect(ProviderCreate.safeParse({ ...base, kind: 'sendgrid', config: {} }).success).toBe(false);
  });

  it('rejects plaintext smtp and out-of-range ports', () => {
    const { id: _i, has_secret: _h, created_at: _c, updated_at: _u, ...base } = smtpProvider;
    const cfg = { ...base.config, password: 'p' };
    expect(ProviderCreate.safeParse({ ...base, config: { ...cfg, security: 'none' } }).success).toBe(false);
    expect(ProviderCreate.safeParse({ ...base, config: { ...cfg, port: 0 } }).success).toBe(false);
    expect(ProviderCreate.safeParse({ ...base, config: { ...cfg, port: 70000 } }).success).toBe(false);
  });

  it('update keeps the secret when omitted and cannot omit kind', () => {
    expect(ProviderUpdate.safeParse({ kind: 'smtp', from_name: 'New' }).success).toBe(true);
    expect(ProviderUpdate.safeParse({ kind: 'smtp', config: { password: 'rotated' } }).success).toBe(true);
    expect(ProviderUpdate.safeParse({ kind: 'resend', policy: { min_interval_ms: 0 } }).success).toBe(true);
    expect(ProviderUpdate.safeParse({ from_name: 'New' }).success).toBe(false);
  });

  it('policy bounds and the iCloud defaults', () => {
    expect(ProviderPolicy.safeParse(ICLOUD_SMTP_POLICY).success).toBe(true);
    expect(ICLOUD_SMTP_POLICY).toEqual({ daily_recipient_budget: 800, min_interval_ms: 3000, max_recipients_per_message: 1 });
    expect(ProviderPolicy.safeParse({ ...ICLOUD_SMTP_POLICY, daily_recipient_budget: 0 }).success).toBe(false);
    expect(ProviderPolicy.safeParse({ ...ICLOUD_SMTP_POLICY, min_interval_ms: -1 }).success).toBe(false);
    expect(ProviderPolicy.safeParse({ ...ICLOUD_SMTP_POLICY, max_recipients_per_message: 1.5 }).success).toBe(false);
  });
});

describe('topics', () => {
  const topic = {
    id: 'tp_1',
    slug: 'programme-updates',
    name: 'Programme updates',
    description: null,
    translations: { en: { name: 'Programme updates', description: null } },
    created_at: TS,
    updated_at: TS,
  };

  it('accepts a topic with translations', () => {
    expect(Topic.safeParse(topic).success).toBe(true);
    expect(TopicCreate.safeParse({ slug: 'venue-outreach', name: 'Venue outreach' }).success).toBe(true);
  });

  it('rejects a bad slug, and an empty update', () => {
    expect(TopicCreate.safeParse({ slug: 'Venue Outreach', name: 'x' }).success).toBe(false);
    expect(TopicUpdate.safeParse({}).success).toBe(false);
    expect(TopicUpdate.safeParse({ name: 'Renamed' }).success).toBe(true);
  });
});

describe('contacts', () => {
  it('accepts a contact', () => {
    expect(Contact.safeParse(contact).success).toBe(true);
    expect(Contact.safeParse({ ...contact, topics: ['Bad Slug'] }).success).toBe(false);
  });

  it('upsert takes external_id or email, and refuses neither', () => {
    expect(ContactUpsert.safeParse({ external_id: 'person_1' }).success).toBe(true);
    expect(ContactUpsert.safeParse({ email: 'a@b.de', first_name: 'Ada' }).success).toBe(true);
    expect(ContactUpsert.safeParse({ external_id: 'p', email: 'a@b.de', properties: { x: null } }).success).toBe(true);
    const neither = ContactUpsert.safeParse({ first_name: 'Ada' });
    expect(neither.success).toBe(false);
    expect(neither.error?.issues[0]?.path).toEqual(['email']);
    expect(ContactUpsert.safeParse({ email: 'not-an-email' }).success).toBe(false);
    expect(ContactUpsert.safeParse({ external_id: '' }).success).toBe(false);
  });

  it('erasure reports what went and that suppressions stayed', () => {
    expect(
      ContactErased.safeParse({ ok: true, erased_messages: 4, erased_recipients: 4, suppressions_kept: 1 }).success,
    ).toBe(true);
    expect(ContactErased.safeParse({ ok: true, erased_messages: -1, erased_recipients: 0, suppressions_kept: 0 }).success).toBe(
      false,
    );
  });
});

describe('suppressions', () => {
  it('accepts every reason on read, a null topic meaning all topics', () => {
    for (const reason of ['unsubscribed', 'bounced', 'complained', 'manual']) {
      const s = { id: 'sup_1', email: 'a@b.de', reason, topic: null, source_message_id: null, note: null, created_at: TS };
      expect(Suppression.safeParse(s).success, reason).toBe(true);
    }
  });

  it('a client may create only manual or unsubscribed blocks', () => {
    expect(SuppressionCreate.safeParse({ email: 'a@b.de', reason: 'manual' }).success).toBe(true);
    expect(SuppressionCreate.safeParse({ email: 'a@b.de', reason: 'unsubscribed', topic: 'venue-outreach' }).success).toBe(
      true,
    );
    expect(SuppressionCreate.safeParse({ email: 'a@b.de', reason: 'bounced' }).success).toBe(false);
    expect(SuppressionCreate.safeParse({ email: 'a@b.de', reason: 'complained' }).success).toBe(false);
    expect(SuppressionCreate.safeParse({ reason: 'manual' }).success).toBe(false);
  });
});
