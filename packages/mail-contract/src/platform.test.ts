import { describe, expect, it } from 'vitest';
import {
  AbTestConfig,
  BoundedSegmentFilter,
  ImportCommitRequest,
  ImportMappingRequest,
  ImportReport,
  SegmentPreviewRequest,
  SignupFormCreate,
  TrackingSettings,
  MAX_FILTER_DEPTH,
  MailingScheduleRequest,
  SegmentFilter,
  SignupSubmission,
  TagAssignment,
  filterDepth,
} from './platform';
import { CheckoutRequest, PlanLimits, PortalRequest, Usage, UsageWarning } from './billing';
import { TS } from './test-fixtures';

describe('segment filter AST', () => {
  it('accepts leaves over every field family', () => {
    for (const leaf of [
      { field: 'email', op: 'contains', value: '@example.com' },
      { field: 'tag', op: 'eq', value: 'founders' },
      { field: 'topic', op: 'neq', value: 'venue-outreach' },
      { field: 'property:city', op: 'in', value: ['Berlin', 'Wien'] },
      { field: 'engagement:opened', op: 'lte', value: 30 },
      { field: 'first_name', op: 'exists' },
    ]) {
      expect(SegmentFilter.safeParse(leaf).success, JSON.stringify(leaf)).toBe(true);
    }
  });

  it('accepts nested and/or/not', () => {
    const f = {
      and: [
        { field: 'topic', op: 'eq', value: 'programme-updates' },
        { or: [{ field: 'tag', op: 'eq', value: 'a' }, { not: { field: 'tag', op: 'eq', value: 'b' } }] },
      ],
    };
    expect(SegmentFilter.safeParse(f).success).toBe(true);
    expect(filterDepth(f as SegmentFilter)).toBe(4);
  });

  it('rejects unknown fields, operators, bad values and mixed nodes', () => {
    expect(SegmentFilter.safeParse({ field: 'password', op: 'eq', value: 'x' }).success).toBe(false);
    expect(SegmentFilter.safeParse({ field: 'email', op: 'like', value: 'x' }).success).toBe(false);
    expect(SegmentFilter.safeParse({ field: 'email', op: 'eq' }).success).toBe(false);
    expect(SegmentFilter.safeParse({ field: 'email', op: 'exists', value: 'x' }).success).toBe(false);
    expect(SegmentFilter.safeParse({ field: 'tag', op: 'in', value: 'a' }).success).toBe(false);
    expect(SegmentFilter.safeParse({ and: [] }).success).toBe(false);
    expect(SegmentFilter.safeParse({ and: [{ field: 'tag', op: 'eq', value: 'a' }], or: [] }).success).toBe(false);
  });

  it('bounds the nesting depth', () => {
    let f: SegmentFilter = { field: 'tag', op: 'eq', value: 'a' };
    for (let i = 1; i < MAX_FILTER_DEPTH; i++) f = { not: f };
    expect(BoundedSegmentFilter.safeParse(f).success).toBe(true);
    expect(BoundedSegmentFilter.safeParse({ not: f }).success).toBe(false);
  });
});

describe('platform requests', () => {
  it('tag assignment takes 1 to 1000 contacts', () => {
    expect(TagAssignment.safeParse({ contact_ids: ['c1'] }).success).toBe(true);
    expect(TagAssignment.safeParse({ contact_ids: [] }).success).toBe(false);
  });

  it('signup submission needs the form token and rejects a filled honeypot', () => {
    const ok = { email: 'a@b.de', form_token: 't' };
    expect(SignupSubmission.safeParse(ok).success).toBe(true);
    expect(SignupSubmission.safeParse({ email: 'a@b.de' }).success).toBe(false);
    expect(SignupSubmission.safeParse({ ...ok, website: '' }).success).toBe(true);
    expect(SignupSubmission.safeParse({ ...ok, website: 'spam.example' }).success).toBe(false);
  });

  it('a signup form needs a provider, topics and consent text; the rest defaults', () => {
    const ok = { name: 'Newsletter', title: 'Stay in touch', consent_text: 'I agree.', topics: ['news'], provider_id: 'prv_1' };
    expect(SignupFormCreate.safeParse(ok).success).toBe(true);
    expect(SignupFormCreate.safeParse({ ...ok, topics: [] }).success).toBe(false);
    expect(SignupFormCreate.safeParse({ ...ok, consent_text: '' }).success).toBe(false);
    expect(SignupFormCreate.safeParse({ ...ok, provider_id: undefined }).success).toBe(false);
  });

  it('a segment preview takes a bounded filter', () => {
    expect(SegmentPreviewRequest.safeParse({ filter: { field: 'tag', op: 'eq', value: 'a' } }).success).toBe(true);
    let f: SegmentFilter = { field: 'tag', op: 'eq', value: 'a' };
    for (let i = 0; i < MAX_FILTER_DEPTH; i++) f = { not: f };
    expect(SegmentPreviewRequest.safeParse({ filter: f }).success).toBe(false);
  });

  it('tracking settings are two booleans', () => {
    expect(TrackingSettings.safeParse({ opens: true, clicks: false }).success).toBe(true);
    expect(TrackingSettings.safeParse({ opens: true }).success).toBe(false);
  });

  it('an import maps exactly one column to email and needs confirmed consent', () => {
    const ok = { mapping: { Email: 'email', Name: 'first_name', City: 'property:city' }, topics: [], tags: [], consent_confirmed: true };
    expect(ImportMappingRequest.safeParse(ok).success).toBe(true);
    expect(ImportMappingRequest.safeParse({ ...ok, mapping: { Name: 'first_name' } }).success).toBe(false);
    expect(ImportMappingRequest.safeParse({ ...ok, mapping: { A: 'email', B: 'email' } }).success).toBe(false);
    expect(ImportMappingRequest.safeParse({ ...ok, mapping: { A: 'email', B: 'password' } }).success).toBe(false);
    expect(ImportMappingRequest.safeParse({ ...ok, consent_confirmed: false }).success).toBe(false);
  });

  it('a commit names the mapping version it validated', () => {
    expect(ImportCommitRequest.safeParse({ mapping_version: 2 }).success).toBe(true);
    expect(ImportCommitRequest.safeParse({}).success).toBe(false);
  });

  it('an import report counts skips by known reasons only', () => {
    const r = { created: 1, updated: 0, unchanged: 0, suppressed: 0, skipped: 1, skipped_by_reason: { invalid_email: 1 }, topics_withheld: 0 };
    expect(ImportReport.safeParse(r).success).toBe(true);
    expect(ImportReport.safeParse({ ...r, skipped_by_reason: { bored: 1 } }).success).toBe(false);
  });

  it('schedule takes a timestamp', () => {
    expect(MailingScheduleRequest.safeParse({ send_at: TS }).success).toBe(true);
    expect(MailingScheduleRequest.safeParse({ send_at: 'tomorrow' }).success).toBe(false);
  });

  it('an A/B test has 2 to 5 uniquely keyed variants and a sane test fraction', () => {
    const ok = {
      variants: [{ key: 'a', subject: 'One' }, { key: 'b', subject: 'Two' }],
      test_fraction: 0.2,
      winner_metric: 'opens',
      decide_after_minutes: 120,
    };
    expect(AbTestConfig.safeParse(ok).success).toBe(true);
    expect(AbTestConfig.safeParse({ ...ok, variants: [ok.variants[0]] }).success).toBe(false);
    expect(AbTestConfig.safeParse({ ...ok, variants: [ok.variants[0], ok.variants[0]] }).success).toBe(false);
    expect(AbTestConfig.safeParse({ ...ok, test_fraction: 0 }).success).toBe(false);
    expect(AbTestConfig.safeParse({ ...ok, decide_after_minutes: 5 }).success).toBe(false);
  });

  it('a metric test needs its wait, a manual test takes none, and every variant changes something', () => {
    const base = { variants: [{ key: 'a', subject: 'One' }, { key: 'b', subject: 'Two' }], test_fraction: 0.5 };
    expect(AbTestConfig.safeParse({ ...base, winner_metric: 'manual' }).success).toBe(true);
    expect(AbTestConfig.safeParse({ ...base, winner_metric: 'manual', decide_after_minutes: 60 }).success).toBe(false);
    expect(AbTestConfig.safeParse({ ...base, winner_metric: 'clicks' }).success).toBe(false);
    expect(AbTestConfig.safeParse({ ...base, winner_metric: 'manual', variants: [{ key: 'a' }, { key: 'b', subject: 'x' }] }).success).toBe(false);
  });
});

describe('billing', () => {
  it('null limits mean unlimited', () => {
    expect(
      PlanLimits.safeParse({ monthly_messages: null, contacts: 1000, members: 3, providers: 1, webhook_endpoints: 2 }).success,
    ).toBe(true);
    expect(PlanLimits.safeParse({ monthly_messages: -1, contacts: 0, members: 1, providers: 1, webhook_endpoints: 0 }).success).toBe(
      false,
    );
  });

  it('usage is keyed by known metrics', () => {
    const u = { plan: 'free', period_start: TS, period_end: TS, metrics: { messages: { used: 10, limit: 1000 } }, warnings: [] };
    expect(Usage.safeParse(u).success).toBe(true);
    expect(Usage.safeParse({ ...u, metrics: { opens: { used: 1, limit: null } } }).success).toBe(false);
  });

  it('checkout only for sold plans', () => {
    const c = { plan: 'starter', success_url: 'https://x.de/ok', cancel_url: 'https://x.de/no' };
    expect(CheckoutRequest.safeParse(c).success).toBe(true);
    expect(CheckoutRequest.safeParse({ ...c, plan: 'design_partner' }).success).toBe(false);
  });

  it('usage warnings name a known metric with a level', () => {
    expect(UsageWarning.safeParse({ metric: 'messages', used: 800, limit: 1000, level: 'approaching' }).success).toBe(true);
    expect(UsageWarning.safeParse({ metric: 'messages', used: 800, limit: 1000, level: 'close' }).success).toBe(false);
  });

  it('the portal takes a return url', () => {
    expect(PortalRequest.safeParse({ return_url: 'https://x.de/billing' }).success).toBe(true);
    expect(PortalRequest.safeParse({ return_url: 'not a url' }).success).toBe(false);
  });
});
