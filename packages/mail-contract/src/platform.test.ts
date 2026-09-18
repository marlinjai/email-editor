import { describe, expect, it } from 'vitest';
import {
  AbTestConfig,
  BoundedSegmentFilter,
  ImportJobCreate,
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

  it('signup submission rejects a filled honeypot', () => {
    expect(SignupSubmission.safeParse({ email: 'a@b.de' }).success).toBe(true);
    expect(SignupSubmission.safeParse({ email: 'a@b.de', website: '' }).success).toBe(true);
    expect(SignupSubmission.safeParse({ email: 'a@b.de', website: 'spam.example' }).success).toBe(false);
  });

  it('an import maps exactly one column to email and needs confirmed consent', () => {
    const ok = { mapping: { Email: 'email', Name: 'first_name', City: 'property:city' }, topics: [], tags: [], consent_confirmed: true };
    expect(ImportJobCreate.safeParse(ok).success).toBe(true);
    expect(ImportJobCreate.safeParse({ ...ok, mapping: { Name: 'first_name' } }).success).toBe(false);
    expect(ImportJobCreate.safeParse({ ...ok, mapping: { A: 'email', B: 'email' } }).success).toBe(false);
    expect(ImportJobCreate.safeParse({ ...ok, mapping: { A: 'email', B: 'password' } }).success).toBe(false);
    expect(ImportJobCreate.safeParse({ ...ok, consent_confirmed: false }).success).toBe(false);
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
