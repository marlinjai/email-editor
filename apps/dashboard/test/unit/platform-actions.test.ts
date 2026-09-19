import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MailApiError } from '@marlinjai/mail-sdk';

/*
 * The S4 and S5 server actions with the mail SDK mocked: what each sends to
 * the service, and how each refusal comes back to the screen.
 */

const viewer = { subject: 'sub-me', email: 'me@example.com', name: 'Me', companies: [{ id: 't', name: 'T' }], activeCompanyId: 't' };

async function* pages<T>(items: T[]) {
  for (const i of items) yield i;
}

const api = {
  paginate: vi.fn(),
  tags: { create: vi.fn(), delete: vi.fn(), assign: vi.fn(), unassign: vi.fn() },
  contactProperties: { create: vi.fn(), delete: vi.fn() },
  segments: { create: vi.fn(), update: vi.fn(), preview: vi.fn(), delete: vi.fn() },
  imports: { create: vi.fn(), setMapping: vi.fn(), commit: vi.fn(), cancel: vi.fn(), rows: vi.fn(), get: vi.fn() },
  signupForms: { create: vi.fn(), update: vi.fn(), delete: vi.fn() },
  templates: { get: vi.fn() },
  mailings: { schedule: vi.fn(), unschedule: vi.fn(), setAbTest: vi.fn(), addSegment: vi.fn(), pickAbWinner: vi.fn() },
  billing: { checkout: vi.fn(), portal: vi.fn() },
  tracking: { update: vi.fn() },
};

vi.mock('@/lib/mail', () => ({ mail: vi.fn(async () => ({ api, viewer })), mailForUpload: vi.fn(async () => ({ api, viewer })) }));
vi.mock('@/lib/viewer', () => ({ requireViewer: vi.fn(async () => viewer), getViewer: vi.fn(async () => viewer) }));
vi.mock('@/lib/auth', () => ({ auth: { appUrl: () => 'https://app.mail.test' } }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

const { setContactTag, createProperty } = await import('@/app/w/[ws]/contacts/actions');
const { saveSegment } = await import('@/app/w/[ws]/contacts/segments/actions');
const { uploadImport, setImportMapping, commitImport, cancelImport } = await import('@/app/w/[ws]/contacts/imports/actions');
const { saveSignupForm } = await import('@/app/w/[ws]/contacts/forms/actions');
const { scheduleMailing, saveAbTest, addSegmentAudience } = await import('@/app/w/[ws]/mailings/actions');
const { startCheckout, openPortal } = await import('@/app/w/[ws]/settings/billing/actions');
const { saveTracking } = await import('@/app/w/[ws]/settings/actions');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('tags and properties', () => {
  it('finds the tag by slug and assigns or removes it on one contact', async () => {
    api.paginate.mockReturnValue(pages([{ id: 't1', slug: 'vip' }, { id: 't2', slug: 'press' }]));
    expect((await setContactTag('ws', 'c1', 'press', true)).ok).toBe(true);
    expect(api.tags.assign).toHaveBeenCalledWith('t2', { contact_ids: ['c1'] });
    api.paginate.mockReturnValue(pages([{ id: 't1', slug: 'vip' }]));
    await setContactTag('ws', 'c1', 'vip', false);
    expect(api.tags.unassign).toHaveBeenCalledWith('t1', { contact_ids: ['c1'] });
  });

  it('says so when the tag was deleted meanwhile', async () => {
    api.paginate.mockReturnValue(pages([]));
    const r = await setContactTag('ws', 'c1', 'gone', true);
    expect(r).toMatchObject({ ok: false, error: { code: 'not_found' } });
    expect(api.tags.assign).not.toHaveBeenCalled();
  });

  it("shows a type conflict in the service's words, not as someone else's edit", async () => {
    api.contactProperties.create.mockRejectedValue(new MailApiError({ code: 'conflict', status: 409, message: 'Some contacts already store a value of "tier" that is not a number.' }));
    const r = await createProperty('ws', { key: 'tier', label: 'Tier', type: 'number' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.message).toBe('Some contacts already store a value of "tier" that is not a number.');
  });
});

describe('segments', () => {
  it('refuses a filter the contract would refuse, before calling the service', async () => {
    const r = await saveSegment('ws', null, { name: 'x', filter: { field: 'nonsense', op: 'eq', value: 1 } as never });
    expect(r.ok).toBe(false);
    expect(api.segments.create).not.toHaveBeenCalled();
  });
  it('creates, or updates by id', async () => {
    api.segments.create.mockResolvedValue({ id: 's1' });
    api.segments.update.mockResolvedValue({ id: 's1' });
    const filter = { field: 'tag', op: 'eq' as const, value: 'vip' };
    await saveSegment('ws', null, { name: 'VIPs', filter });
    expect(api.segments.create).toHaveBeenCalledWith({ name: 'VIPs', filter });
    await saveSegment('ws', 's1', { name: 'VIPs', filter });
    expect(api.segments.update).toHaveBeenCalledWith('s1', { name: 'VIPs', filter });
  });
});

describe('imports', () => {
  it('refuses an empty or oversized file before uploading', async () => {
    const empty = new FormData();
    expect((await uploadImport('ws', empty)).ok).toBe(false);
    const big = new FormData();
    big.set('file', new File([new Uint8Array(51 * 1024 * 1024)], 'big.csv'));
    const r = await uploadImport('ws', big);
    expect(r).toMatchObject({ ok: false, error: { code: 'payload_too_large' } });
    expect(api.imports.create).not.toHaveBeenCalled();
  });

  it('needs exactly one email column and the consent statement', async () => {
    const base = { topics: [], tags: [], updateExisting: true };
    expect((await setImportMapping('ws', 'i1', { ...base, mapping: { a: 'first_name' }, consent: true })).ok).toBe(false);
    expect((await setImportMapping('ws', 'i1', { ...base, mapping: { a: 'email', b: 'email' }, consent: true })).ok).toBe(false);
    expect((await setImportMapping('ws', 'i1', { ...base, mapping: { a: 'email' }, consent: false as true })).ok).toBe(false);
    expect(api.imports.setMapping).not.toHaveBeenCalled();
    api.imports.setMapping.mockResolvedValue({ id: 'i1' });
    await setImportMapping('ws', 'i1', { ...base, mapping: { a: 'email', b: 'ignore' }, consent: true, tags: ['vip'] });
    expect(api.imports.setMapping).toHaveBeenCalledWith('i1', { mapping: { a: 'email', b: 'ignore' }, topics: [], tags: ['vip'], update_existing: true, consent_confirmed: true });
  });

  it('commits the version on screen, and a newer mapping is a conflict that says nothing was imported', async () => {
    api.imports.commit.mockRejectedValue(
      new MailApiError({ code: 'conflict', status: 409, message: 'The mapping changed since version 1; review the dry run of version 2 and commit that.', details: { mapping_version: 2 } }),
    );
    const r = await commitImport('ws', 'i1', 1);
    expect(api.imports.commit).toHaveBeenCalledWith('i1', { mapping_version: 1 });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe('conflict');
      expect(r.error.message).toMatch(/^Nothing was imported\. The mapping changed/);
      expect(r.error.details).toEqual({ mapping_version: 2 });
    }
  });

  it('cancelling a finished import points at how it ended', async () => {
    api.imports.cancel.mockRejectedValue(new MailApiError({ code: 'conflict', status: 409, message: 'A completed import cannot be cancelled.' }));
    const r = await cancelImport('ws', 'i1');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.message).toContain('Reload to see how it ended.');
  });
});

describe('signup forms', () => {
  it('keeps a language only with both texts, and sends nulls for the defaults', async () => {
    api.signupForms.create.mockResolvedValue({ id: 'f1' });
    const r = await saveSignupForm('ws', null, {
      name: 'News',
      title: 'Stay in touch',
      consentText: 'I agree.',
      translations: [
        { locale: 'de', title: 'Bleiben Sie dran', consentText: 'Ich stimme zu.' },
        { locale: 'fr', title: 'Restez', consentText: '' },
      ],
      topics: ['news'],
      tags: [],
      fields: ['first_name'],
      providerId: 'p1',
      confirmationTemplateId: '',
      redirectUrl: '',
      allowedOrigins: ['https://example.com'],
    });
    expect(r.ok).toBe(true);
    expect(api.signupForms.create).toHaveBeenCalledWith(
      expect.objectContaining({
        translations: { de: { title: 'Bleiben Sie dran', consent_text: 'Ich stimme zu.' } },
        confirmation_template_id: null,
        redirect_url: null,
        allowed_origins: ['https://example.com'],
      }),
    );
  });
  it('needs a topic', async () => {
    const r = await saveSignupForm('ws', null, {
      name: 'x', title: 'x', consentText: 'x', translations: [], topics: [], tags: [], fields: [], providerId: 'p1', confirmationTemplateId: '', redirectUrl: '', allowedOrigins: [],
    });
    expect(r).toMatchObject({ ok: false, error: { fields: { topics: 'Choose at least one topic' } } });
  });
});

describe('scheduling, segments and A/B tests on a mailing', () => {
  it('refuses a time in the past and sends the ISO time otherwise', async () => {
    expect((await scheduleMailing('ws', 'm1', { sendAt: new Date(Date.now() - 60_000).toISOString() })).ok).toBe(false);
    api.mailings.schedule.mockResolvedValue({ id: 'm1', status: 'scheduled' });
    const at = new Date(Date.now() + 3_600_000).toISOString();
    await scheduleMailing('ws', 'm1', { sendAt: at });
    expect(api.mailings.schedule).toHaveBeenCalledWith('m1', { send_at: at });
  });

  it('asks for a segment before calling the service', async () => {
    expect((await addSegmentAudience('ws', 'm1', '')).ok).toBe(false);
    expect(api.mailings.addSegment).not.toHaveBeenCalled();
  });

  it('builds the test from subjects and template content, as fractions and minutes', async () => {
    api.templates.get.mockResolvedValue({ document: { sections: [] } });
    api.mailings.setAbTest.mockResolvedValue({ id: 'm1' });
    await saveAbTest('ws', 'm1', {
      variants: [
        { key: 'a', subject: 'Hello', templateId: '' },
        { key: 'b', subject: '', templateId: 'tpl-1' },
      ],
      testPercent: 20,
      winnerMetric: 'opens',
      decideAfterMinutes: 240,
    });
    expect(api.mailings.setAbTest).toHaveBeenCalledWith('m1', {
      variants: [{ key: 'a', subject: 'Hello' }, { key: 'b', document: { sections: [] } }],
      test_fraction: 0.2,
      winner_metric: 'opens',
      decide_after_minutes: 240,
    });
  });

  it('keeps a variant\'s current content without fetching or sending a document', async () => {
    api.mailings.setAbTest.mockResolvedValue({ id: 'm1' });
    await saveAbTest('ws', 'm1', {
      variants: [
        { key: 'a', subject: 'Hello', templateId: '' },
        { key: 'c', subject: '', templateId: 'keep' },
      ],
      testPercent: 30,
      winnerMetric: 'manual',
      decideAfterMinutes: null,
    });
    expect(api.templates.get).not.toHaveBeenCalled();
    expect(api.mailings.setAbTest).toHaveBeenCalledWith('m1', {
      variants: [{ key: 'a', subject: 'Hello' }, { key: 'c', keep_document: true }],
      test_fraction: 0.3,
      winner_metric: 'manual',
    });
  });

  it('refuses a variant that changes nothing, and a metric test without a time', async () => {
    const r = await saveAbTest('ws', 'm1', {
      variants: [
        { key: 'a', subject: 'x', templateId: '' },
        { key: 'b', subject: '', templateId: '' },
      ],
      testPercent: 20,
      winnerMetric: 'clicks',
      decideAfterMinutes: null,
    });
    expect(r).toMatchObject({ ok: false, error: { fields: { 'variants.1': expect.any(String), decideAfterMinutes: expect.any(String) } } });
  });

  it('passes a plan without A/B tests through as plan_limit_reached', async () => {
    api.mailings.setAbTest.mockRejectedValue(
      new MailApiError({ code: 'plan_limit_reached', status: 429, message: 'The Free plan does not include ab testing. Upgrade the plan to use it.', details: { feature: 'ab_testing', plan: 'free' } }),
    );
    const r = await saveAbTest('ws', 'm1', { variants: [{ key: 'a', subject: 'x', templateId: '' }, { key: 'b', subject: 'y', templateId: '' }], testPercent: 50, winnerMetric: 'manual', decideAfterMinutes: null });
    expect(r).toMatchObject({ ok: false, error: { code: 'plan_limit_reached', message: expect.stringMatching(/Free plan/) } });
  });
});

describe('billing and tracking', () => {
  it('sends checkout back to the Billing screen and follows only a Stripe address', async () => {
    api.billing.checkout.mockResolvedValue({ url: 'https://checkout.stripe.com/c/pay/cs_1' });
    const r = await startCheckout('ws-1', 'starter');
    expect(r).toEqual({ ok: true, data: { url: 'https://checkout.stripe.com/c/pay/cs_1' } });
    expect(api.billing.checkout).toHaveBeenCalledWith({
      plan: 'starter',
      success_url: 'https://app.mail.test/w/ws-1/settings/billing?checkout=success',
      cancel_url: 'https://app.mail.test/w/ws-1/settings/billing?checkout=cancelled',
    });
    api.billing.portal.mockResolvedValue({ url: 'https://evil.example/portal' });
    expect((await openPortal('ws-1')).ok).toBe(false);
  });

  it('only sells the paid plans', async () => {
    expect((await startCheckout('ws', 'design_partner')).ok).toBe(false);
    expect(api.billing.checkout).not.toHaveBeenCalled();
  });

  it('turns billing_not_configured into "billing not yet available", keeping the reason for the screen', async () => {
    api.billing.checkout.mockRejectedValue(
      new MailApiError({ code: 'service_unavailable', status: 503, message: 'Billing is not configured on this instance (no Stripe key).', details: { reason: 'billing_not_configured' } }),
    );
    const r = await startCheckout('ws', 'growth');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.message).toMatch(/^Billing is not available yet/);
      expect(r.error.details).toEqual({ reason: 'billing_not_configured' });
    }
  });

  it('saves tracking as opens and clicks', async () => {
    api.tracking.update.mockResolvedValue({ opens: true, clicks: false });
    const r = await saveTracking('ws', { opens: true, clicks: false });
    expect(r).toEqual({ ok: true, data: { opens: true, clicks: false } });
  });
});
