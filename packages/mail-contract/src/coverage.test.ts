import { describe, expect, it } from 'vitest';
import type { z } from 'zod';
import { ContactListQuery, SuppressionListQuery } from './contacts';
import { MailingListQuery, MessageListQuery, RecipientListQuery } from './mailings';
import { ProviderUsage, ProviderVerifyResult } from './providers';
import { TemplateListQuery, TemplateVersion } from './templates';
import { WebhookDeliveryListQuery, WebhookEndpoint } from './webhooks';
import { AuditQuery } from './workspace';
import { ImportJob, MailingAnalytics, Segment, SignupForm, Tag } from './platform';
import { Plan, Subscription } from './billing';
import { TS, counts, doc } from './test-fixtures';

/** Each list query: accepts nothing, enforces the limit, and rejects a bad filter value. */
const listQueries: [string, z.ZodTypeAny, Record<string, string>][] = [
  ['ContactListQuery', ContactListQuery, { topic: 'Not A Slug' }],
  ['SuppressionListQuery', SuppressionListQuery, { reason: 'bored' }],
  ['MailingListQuery', MailingListQuery, { status: 'done' }],
  ['MessageListQuery', MessageListQuery, { outcome: 'queued' }],
  ['RecipientListQuery', RecipientListQuery, { skip_reason: 'bored' }],
  ['TemplateListQuery', TemplateListQuery, { archived: 'maybe' }],
  ['WebhookDeliveryListQuery', WebhookDeliveryListQuery, { event_type: 'message.opened' }],
  ['AuditQuery', AuditQuery, { action: 'nope' }],
];

describe('list queries', () => {
  for (const [name, schema, badFilter] of listQueries) {
    it(`${name} accepts {}, enforces the limit and rejects a bad filter`, () => {
      expect(schema.safeParse({}).success).toBe(true);
      expect(schema.safeParse({ limit: '100', cursor: 'c' }).success).toBe(true);
      expect(schema.safeParse({ limit: '0' }).success).toBe(false);
      expect(schema.safeParse(badFilter).success).toBe(false);
    });
  }
});

/** Each read shape: a valid fixture passes, and breaking one field fails. */
const readShapes: [string, z.ZodTypeAny, Record<string, unknown>, Record<string, unknown>][] = [
  [
    'ProviderUsage',
    ProviderUsage,
    { provider_id: 'prv_1', recipients_last_24h: 800, remaining_budget: 0, next_capacity_at: TS },
    { remaining_budget: -1 },
  ],
  ['ProviderVerifyResult', ProviderVerifyResult, { ok: false, error: '535 authentication failed' }, { ok: 'no' }],
  [
    'TemplateVersion',
    TemplateVersion,
    { template_id: 'tpl_1', version: 2, document: doc, created_by: null, created_at: TS },
    { version: 0 },
  ],
  [
    'WebhookEndpoint',
    WebhookEndpoint,
    { id: 'wh_1', url: 'https://x.de/h', description: null, events: ['mailing.finished'], enabled: true, created_at: TS, updated_at: TS },
    { events: [] },
  ],
  ['Tag', Tag, { id: 't1', slug: 'founders', name: 'Founders', contact_count: 3, created_at: TS }, { slug: 'Founders' }],
  [
    'Segment',
    Segment,
    {
      id: 'seg_1',
      name: 'Berlin',
      filter: { field: 'property:city', op: 'eq', value: 'Berlin' },
      contact_count: 12,
      created_at: TS,
      updated_at: TS,
    },
    { filter: { field: 'city', op: 'eq', value: 'Berlin' } },
  ],
  [
    'SignupForm',
    SignupForm,
    {
      id: 'sf_1',
      name: 'Newsletter',
      topics: ['programme-updates'],
      tags: [],
      fields: ['first_name'],
      double_opt_in: true,
      title: 'Stay in touch',
      consent_text: 'I agree to receive the newsletter.',
      translations: { de: { title: 'Bleiben Sie informiert', consent_text: 'Ich willige ein.' } },
      provider_id: 'prv_1',
      confirmation_template_id: null,
      redirect_url: null,
      allowed_origins: ['https://opuntia.example'],
      version: 1,
      created_at: TS,
      updated_at: TS,
    },
    { double_opt_in: false },
  ],
  [
    'ImportJob',
    ImportJob,
    {
      id: 'imp_1',
      status: 'completed',
      file_name: 'people.csv',
      file_bytes: 120,
      total_rows: 3,
      columns: ['Email', 'Name'],
      sample: [['a@b.de', 'Ada']],
      suggested_mapping: { Email: 'email', Name: 'first_name' },
      mapping: { Email: 'email', Name: 'first_name' },
      mapping_version: 1,
      topics: ['news'],
      tags: [],
      update_existing: true,
      dry_run: { created: 2, updated: 0, unchanged: 0, suppressed: 1, skipped: 0, skipped_by_reason: {}, topics_withheld: 0 },
      result: { created: 2, updated: 0, unchanged: 0, suppressed: 1, skipped: 0, skipped_by_reason: {}, topics_withheld: 0 },
      processed_rows: 3,
      error: null,
      created_at: TS,
      updated_at: TS,
      finished_at: TS,
    },
    { status: 'exploded' },
  ],
  [
    'MailingAnalytics',
    MailingAnalytics,
    {
      mailing_id: 'mlg_1',
      counts,
      tracking: null,
      unique_opens: null,
      apple_mpp_opens: null,
      machine_events: null,
      unique_clicks: null,
      unsubscribes: 1,
      bounces: 0,
      complaints: 0,
      links: null,
      variants: null,
    },
    { unsubscribes: -1 },
  ],
  [
    'Plan',
    Plan,
    {
      id: 'free',
      name: 'Free',
      monthly_price_cents: 0,
      currency: 'EUR',
      limits: { monthly_messages: 1000, contacts: 500, members: 1, providers: 1, webhook_endpoints: 1 },
      features: { ab_testing: false, tracking: false, custom_domains: false },
    },
    { currency: 'EURO' },
  ],
  [
    'Subscription',
    Subscription,
    {
      workspace_id: 'ws_1',
      plan: 'design_partner',
      status: 'active',
      current_period_start: TS,
      current_period_end: TS,
      cancel_at_period_end: false,
      billing_exempt: true,
    },
    { plan: 'enterprise' },
  ],
];

describe('read shapes', () => {
  for (const [name, schema, valid, broken] of readShapes) {
    it(`${name} accepts a valid value and rejects a broken field`, () => {
      expect(schema.safeParse(valid).success).toBe(true);
      expect(schema.safeParse({ ...valid, ...broken }).success).toBe(false);
    });
  }
});
