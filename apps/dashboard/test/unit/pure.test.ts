import { describe, expect, it } from 'vitest';
import { MailApiError, MailNetworkError, MailResponseValidationError, MailTimeoutError } from '@marlinjai/mail-sdk';
import { describeError } from '@/lib/errors';
import { formatBytes, percent, slugify } from '@/lib/format';
import { mailingControls, mailingProgress } from '@/lib/mailing-status';
import { can } from '@/lib/roles';
import { formatPrice, usageLevel, usageSentence, usageWarningSummary } from '@/lib/usage';
import { assertTestAuthNotInProduction, decodeTestIdentity, encodeTestIdentity, testAuthEnabled, TestAuthInProductionError } from '@/lib/test-auth';

const api = (code: ConstructorParameters<typeof MailApiError>[0]['code'], extra: Partial<ConstructorParameters<typeof MailApiError>[0]> = {}) =>
  new MailApiError({ code, status: 400, message: 'service says so', requestId: 'req-1', ...extra });

describe('describeError: every contract error becomes a sentence a person can act on', () => {
  it('turns validation issues into per-field messages', () => {
    const e = describeError(
      api('validation_failed', {
        details: {
          issues: [
            { path: ['config', 'port'], message: 'Expected number' },
            { path: ['name'], message: 'Required' },
            { path: ['name'], message: 'second message for the same field is dropped' },
          ],
        },
      }),
    );
    expect(e.code).toBe('validation_failed');
    expect(e.fields).toEqual({ 'config.port': 'Expected number', name: 'Required' });
    expect(e.requestId).toBe('req-1');
  });

  it('keeps the service reason where only it knows the specifics', () => {
    expect(describeError(api('mailing_invalid_state', { message: 'A sent mailing cannot pause.' })).message).toContain('A sent mailing cannot pause.');
    expect(describeError(api('last_owner')).message).toMatch(/at least one owner/);
  });

  it('names the fix for the send-time refusals', () => {
    expect(describeError(api('missing_unsubscribe_url')).message).toContain('{{unsubscribe_url}}');
    expect(describeError(api('mailing_not_ready')).message).toMatch(/recipient/);
    expect(describeError(api('daily_budget_exhausted')).message).toMatch(/budget/);
    expect(describeError(api('insufficient_role')).message).toMatch(/role/);
  });

  it('separates an unreachable service from a broken contract and from anything else', () => {
    expect(describeError(new MailNetworkError('down', null)).code).toBe('network');
    expect(describeError(new MailTimeoutError(10_000)).code).toBe('network');
    expect(describeError(new MailResponseValidationError('workspace.get', [])).message).toMatch(/shape/);
    const missingConfig = Object.assign(new Error('x'), { name: 'DashboardConfigError' });
    expect(describeError(missingConfig).code).toBe('service_unavailable');
    expect(describeError(new Error('boom'))).toEqual({ code: 'internal_error', message: expect.stringMatching(/our side/) });
  });
});

describe('mailing controls follow the contract table', () => {
  it('offers exactly what MAILING_TRANSITIONS allows', () => {
    expect(mailingControls('draft')).toMatchObject({ editable: true, send: true, cancel: true, pause: false, duplicate: false, live: false });
    expect(mailingControls('sending')).toMatchObject({ editable: false, send: false, pause: true, cancel: true, live: true, duplicate: true });
    expect(mailingControls('paused')).toMatchObject({ resume: true, cancel: true, pause: false, live: true });
    expect(mailingControls('partially_failed')).toMatchObject({ retryFailed: true, cancel: false, live: false, duplicate: true });
    // A cancelled mailing is read-only: nothing but duplicating it.
    const cancelled = mailingControls('cancelled');
    expect(cancelled).toMatchObject({ editable: false, send: false, pause: false, resume: false, cancel: false, retryFailed: false, duplicate: true, terminal: true });
  });

  it('computes progress without dividing by zero', () => {
    expect(mailingProgress({ total: 0, queued: 0, sending: 0, sent: 0, failed: 0, skipped: 0 })).toEqual({ settled: 0, total: 0, percent: 0 });
    expect(mailingProgress({ total: 4, queued: 1, sending: 0, sent: 2, failed: 1, skipped: 0 }).percent).toBe(75);
  });
});

describe('plan usage in words', () => {
  it('places a count against its limit at the contract threshold', () => {
    expect(usageLevel(10, null)).toBe('ok');
    expect(usageLevel(799, 1000)).toBe('ok');
    expect(usageLevel(800, 1000)).toBe('approaching');
    expect(usageLevel(1000, 1000)).toBe('reached');
    expect(usageLevel(1200, 1000)).toBe('reached');
  });
  it('names the metric, and the period only for messages', () => {
    expect(usageSentence({ metric: 'messages', used: 8200, limit: 10000 })).toBe('8,200 of 10,000 messages this period');
    expect(usageSentence({ metric: 'webhook_endpoints', used: 1, limit: 1 })).toBe('1 of 1 webhook endpoints');
  });
  it('summarises warnings by their worst level', () => {
    expect(usageWarningSummary([])).toBeNull();
    expect(usageWarningSummary([{ metric: 'messages', used: 850, limit: 1000 }])?.level).toBe('approaching');
    const both = usageWarningSummary([
      { metric: 'messages', used: 850, limit: 1000 },
      { metric: 'contacts', used: 500, limit: 500 },
    ]);
    expect(both?.level).toBe('reached');
    expect(both?.text).toContain('500 of 500 contacts');
  });
  it('does not interrupt for counts only an admin changes', () => {
    expect(usageWarningSummary([{ metric: 'providers', used: 1, limit: 1 }, { metric: 'members', used: 2, limit: 2 }])).toBeNull();
    expect(usageWarningSummary([{ metric: 'providers', used: 1, limit: 1 }, { metric: 'contacts', used: 420, limit: 500 }])?.text).not.toContain('providers');
  });
  it('prices a plan, or says it is not sold', () => {
    expect(formatPrice({ monthly_price_cents: 0, currency: 'EUR' })).toBe('Free');
    expect(formatPrice({ monthly_price_cents: 900, currency: 'EUR' })).toBe('€9 a month');
    expect(formatPrice({ monthly_price_cents: 2950, currency: 'EUR' })).toBe('€29.50 a month');
    expect(formatPrice({ monthly_price_cents: null, currency: 'EUR' })).toBeNull();
  });
});

describe('small helpers', () => {
  it('slugify suggests a valid slug', () => {
    expect(slugify('ŌPUNTIA Gatherings!')).toBe('opuntia-gatherings');
    expect(slugify('  --  ')).toBe('');
    expect(slugify('a'.repeat(80))).toHaveLength(64);
  });
  it('percent clamps and never returns NaN', () => {
    expect(percent(5, 0)).toBe(0);
    expect(percent(200, 100)).toBe(100);
  });
  it('formatBytes', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(10 * 1024 * 1024)).toBe('10.0 MB');
  });
  it('roles reach the contract access levels', () => {
    expect(can('viewer', 'read')).toBe(true);
    expect(can('viewer', 'write')).toBe(false);
    expect(can('editor', 'write')).toBe(true);
    expect(can('editor', 'admin')).toBe(false);
    expect(can('admin', 'admin')).toBe(true);
    expect(can('admin', 'owner')).toBe(false);
    expect(can('owner', 'owner')).toBe(true);
  });
});

describe('the end-to-end sign-in bypass cannot be enabled in production', () => {
  it('is on only with the flag and outside production', () => {
    expect(testAuthEnabled({ MAIL_DASHBOARD_TEST_AUTH: '1', NODE_ENV: 'development' })).toBe(true);
    expect(testAuthEnabled({ MAIL_DASHBOARD_TEST_AUTH: '1', NODE_ENV: 'test' })).toBe(true);
    expect(testAuthEnabled({ MAIL_DASHBOARD_TEST_AUTH: '1', NODE_ENV: 'production' })).toBe(false);
    expect(testAuthEnabled({ MAIL_DASHBOARD_TEST_AUTH: 'true', NODE_ENV: 'development' })).toBe(false);
    expect(testAuthEnabled({ NODE_ENV: 'development' })).toBe(false);
  });

  it('makes a production process refuse to start when the flag is present at all', () => {
    expect(() => assertTestAuthNotInProduction({ MAIL_DASHBOARD_TEST_AUTH: '1', NODE_ENV: 'production' })).toThrow(TestAuthInProductionError);
    expect(() => assertTestAuthNotInProduction({ MAIL_DASHBOARD_TEST_AUTH: '0', NODE_ENV: 'production' })).toThrow(TestAuthInProductionError);
    expect(() => assertTestAuthNotInProduction({ NODE_ENV: 'production' })).not.toThrow();
    expect(() => assertTestAuthNotInProduction({ MAIL_DASHBOARD_TEST_AUTH: '1', NODE_ENV: 'development' })).not.toThrow();
  });

  it('ignores a malformed identity cookie', () => {
    const good = encodeTestIdentity({ subject: 's', email: 'a@b.co', name: null, companies: [{ id: 't', name: 'T' }] });
    expect(decodeTestIdentity(good)).toEqual({ subject: 's', email: 'a@b.co', name: null, companies: [{ id: 't', name: 'T' }] });
    expect(decodeTestIdentity('not base64 json')).toBeNull();
    expect(decodeTestIdentity(encodeTestIdentity({ subject: '', email: 'a@b.co', name: null, companies: [] }))).toBeNull();
    expect(decodeTestIdentity(undefined)).toBeNull();
  });
});

describe('offServiceAddresses: the images a service_only workspace must import', () => {
  it('reads the addresses from the compile errors, each once, http and https only', async () => {
    const { offServiceAddresses } = await import('@/lib/asset-policy');
    const errors = [
      { message: 'img src: "https://cdn.example.com/a.png" loads from cdn.example.com. This workspace only allows images, stylesheets and fonts from mail.test: upload the file or import it with assets.import.' },
      { message: 'background: "https://cdn.example.com/a.png" loads from cdn.example.com. This workspace only allows ...' },
      { message: 'link href: "http://fonts.example.org/f.css" loads from fonts.example.org. ...' },
      { message: 'img src: "data:image/png;base64,xx" uses data, not http or https. ...' },
      { message: 'mj-section: Attribute foo is illegal' },
      { message: 'img src: "https://cdn.example.com/very-long..." loads from cdn.example.com. ...' },
      { message: 'And 3 more addresses outside mail.test.' },
    ];
    expect(offServiceAddresses(errors)).toEqual(['https://cdn.example.com/a.png', 'http://fonts.example.org/f.css']);
    expect(offServiceAddresses([])).toEqual([]);
  });
});
