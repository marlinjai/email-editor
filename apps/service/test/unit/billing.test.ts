import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { Plan, Usage } from '@marlinjai/mail-contract';
import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from '../../src/config.js';
import { PAID_PLANS, planForPrice, PLANS } from '../../src/billing/plans.js';
import {
  createStripeApi,
  readProductTag,
  readSubscriptionId,
  readWorkspaceId,
  signStripePayload,
  StripeRequestError,
  subscriptionPeriod,
  verifyStripeSignature,
  type StripeEvent,
  type StripeSubscription,
} from '../../src/billing/stripe.js';
import { belongsTo, mirrorOf, UnknownPriceError } from '../../src/billing/sync.js';
import { periodOf, usageWarningHeader } from '../../src/billing/usage.js';
import type { BillingRow } from '../../src/repo/billing.js';
import { STRIPE_WEBHOOK_EVENTS } from '../../src/routes/stripe-webhook.js';
import { STRIPE_API_VERSION } from '../../src/billing/plans.js';

/** Made per run, never written out: see test/support/fake-stripe.ts. */
const fake = (prefix: string) => `${prefix}_${randomBytes(12).toString('hex')}`;
const SECRET = fake('whsec');
const WS = '0b8f6a3e-4c1d-4e2f-9a7b-1c2d3e4f5a6b';
const config = { prices: { starter: 'price_S', growth: 'price_G' } };

function sub(over: Partial<StripeSubscription> = {}): StripeSubscription {
  return {
    id: 'sub_1',
    customer: 'cus_1',
    status: 'active',
    cancel_at_period_end: false,
    metadata: { product: 'mail', workspace_id: WS },
    items: { data: [{ price: { id: 'price_S' }, current_period_start: 1_750_000_000, current_period_end: 1_752_592_000 }] },
    created: 1_750_000_000,
    ...over,
  };
}

describe('Stripe signature', () => {
  const body = '{"id":"evt_1","type":"invoice.paid"}';
  const now = 1_760_000_000;

  it('accepts its own signature and any matching v1 among several', () => {
    expect(verifyStripeSignature(body, signStripePayload(body, SECRET, now), SECRET, now)).toBe(true);
    const good = signStripePayload(body, SECRET, now).split(',')[1]!;
    expect(verifyStripeSignature(body, `t=${now},v1=${'0'.repeat(64)},${good}`, SECRET, now)).toBe(true);
  });

  it('refuses another secret, another body, a missing header and malformed ones', () => {
    expect(verifyStripeSignature(body, signStripePayload(body, fake('whsec'), now), SECRET, now)).toBe(false);
    expect(verifyStripeSignature(`${body} `, signStripePayload(body, SECRET, now), SECRET, now)).toBe(false);
    expect(verifyStripeSignature(body, undefined, SECRET, now)).toBe(false);
    expect(verifyStripeSignature(body, 'garbage', SECRET, now)).toBe(false);
    expect(verifyStripeSignature(body, `t=${now}`, SECRET, now)).toBe(false);
    expect(verifyStripeSignature(body, `t=abc,v1=${'a'.repeat(64)}`, SECRET, now)).toBe(false);
  });

  it('holds a 300 second tolerance both ways', () => {
    expect(verifyStripeSignature(body, signStripePayload(body, SECRET, now - 300), SECRET, now)).toBe(true);
    expect(verifyStripeSignature(body, signStripePayload(body, SECRET, now - 301), SECRET, now)).toBe(false);
    expect(verifyStripeSignature(body, signStripePayload(body, SECRET, now + 301), SECRET, now)).toBe(false);
  });
});

describe('reading events', () => {
  const event = (type: string, object: StripeEvent['data']['object']): StripeEvent => ({ id: 'evt_1', type, created: 1, data: { object } });

  it('finds the product tag where each event family carries it', () => {
    expect(readProductTag(event('checkout.session.completed', { metadata: { product: 'mail' } }))).toBe('mail');
    expect(readProductTag(event('customer.subscription.updated', { metadata: { product: 'qr' } }))).toBe('qr');
    expect(readProductTag(event('invoice.paid', { subscription_details: { metadata: { product: 'mail' } } }))).toBe('mail');
    expect(readProductTag(event('invoice.paid', { parent: { subscription_details: { metadata: { product: 'mail' } } } }))).toBe('mail');
    // An invoice's own metadata is not the subscription's.
    expect(readProductTag(event('invoice.paid', { metadata: { product: 'mail' } }))).toBeNull();
    expect(readProductTag(event('customer.subscription.deleted', { metadata: { product: '' } }))).toBeNull();
  });

  it('reads the subscription and a well-formed workspace id, never anything else', () => {
    expect(readSubscriptionId(event('customer.subscription.updated', { id: 'sub_9' }))).toBe('sub_9');
    expect(readSubscriptionId(event('checkout.session.completed', { id: 'cs_1', subscription: 'sub_9' }))).toBe('sub_9');
    expect(readSubscriptionId(event('invoice.paid', { parent: { subscription_details: { subscription: 'sub_9' } } }))).toBe('sub_9');
    expect(readWorkspaceId(event('checkout.session.completed', { client_reference_id: WS.toUpperCase() }))).toBe(WS);
    expect(readWorkspaceId(event('checkout.session.completed', { metadata: { workspace_id: "x' OR 1=1" } }))).toBeNull();
  });
});

describe('mirroring a subscription', () => {
  it('maps each Stripe status onto a plan and a status', () => {
    expect(mirrorOf(config, sub())).toMatchObject({ plan: 'starter', status: 'active', stripeSubscriptionId: 'sub_1' });
    expect(mirrorOf(config, sub({ status: 'trialing' }))).toMatchObject({ plan: 'starter', status: 'trialing' });
    expect(mirrorOf(config, sub({ status: 'past_due' }))).toMatchObject({ plan: 'starter', status: 'past_due' });
    expect(mirrorOf(config, sub({ status: 'unpaid' }))).toMatchObject({ plan: 'starter', status: 'past_due' });
    expect(mirrorOf(config, sub({ status: 'paused' }))).toMatchObject({ plan: 'free', status: 'past_due', stripeSubscriptionId: null });
    expect(mirrorOf(config, sub({ status: 'canceled' }))).toMatchObject({ plan: 'free', status: 'cancelled', stripeSubscriptionId: null });
    expect(mirrorOf(config, sub({ status: 'incomplete_expired' }))).toMatchObject({ plan: 'free', status: 'cancelled' });
    expect(mirrorOf(config, sub({ status: 'incomplete' }))).toBeNull();
  });

  it('refuses an unknown Price instead of guessing a plan', () => {
    expect(() => mirrorOf(config, sub({ items: { data: [{ price: { id: 'price_other' } }] } }))).toThrow(UnknownPriceError);
    expect(() => mirrorOf({ prices: {} }, sub())).toThrow(UnknownPriceError);
  });

  it('reads the period from the item (basil) or the subscription (before it)', () => {
    expect(subscriptionPeriod(sub())).toEqual({ start: new Date(1_750_000_000_000).toISOString(), end: new Date(1_752_592_000_000).toISOString() });
    expect(subscriptionPeriod(sub({ items: { data: [{ price: { id: 'price_S' } }] }, current_period_start: 10, current_period_end: 20 }))).toEqual({
      start: new Date(10_000).toISOString(),
      end: new Date(20_000).toISOString(),
    });
    expect(subscriptionPeriod(sub({ items: { data: [{ price: { id: 'price_S' } }] } }))).toBeNull();
  });

  it('only takes a subscription tagged for this product and this workspace', () => {
    expect(belongsTo(sub(), WS)).toBe(true);
    expect(belongsTo(sub({ metadata: { product: 'qr' } }), WS)).toBe(false);
    expect(belongsTo(sub({ metadata: { product: 'mail', workspace_id: 'another' } }), WS)).toBe(false);
  });
});

describe('plans and periods', () => {
  it('every plan matches the contract, and prices map back to their plan', () => {
    for (const plan of Object.values(PLANS)) expect(Plan.safeParse(plan).success).toBe(true);
    expect(PAID_PLANS.map((p) => planForPrice(config, config.prices[p]))).toEqual(['starter', 'growth']);
    expect(planForPrice(config, 'price_unknown')).toBeNull();
    // Plans only grow: every limit of a bigger plan is at least the smaller one's.
    const order = ['free', 'starter', 'growth', 'design_partner'] as const;
    for (let i = 1; i < order.length; i++) {
      for (const [k, v] of Object.entries(PLANS[order[i]!].limits)) {
        const smaller = PLANS[order[i - 1]!].limits[k as keyof Plan['limits']];
        if (v !== null && smaller !== null) expect(v).toBeGreaterThanOrEqual(smaller);
        if (smaller === null) expect(v).toBeNull();
      }
    }
  });

  const row = (over: Partial<BillingRow>): BillingRow => ({
    workspace_id: WS,
    plan: 'free',
    status: 'active',
    billing_exempt: false,
    exempt_reason: null,
    stripe_customer_id: null,
    stripe_subscription_id: null,
    stripe_price_id: null,
    current_period_start: null,
    current_period_end: null,
    cancel_at_period_end: false,
    stripe_synced_at: null,
    updated_at: new Date().toISOString(),
    ...over,
  });

  it('meters the free plan by calendar month in UTC, a paid one by its Stripe period', () => {
    const now = new Date('2026-02-14T23:30:00Z');
    expect(periodOf(row({}), now)).toEqual({ start: '2026-02-01T00:00:00.000Z', end: '2026-03-01T00:00:00.000Z' });
    const paid = row({ plan: 'starter', current_period_start: '2026-02-10T08:00:00.000Z', current_period_end: '2026-03-10T08:00:00.000Z' });
    expect(periodOf(paid, now)).toEqual({ start: '2026-02-10T08:00:00.000Z', end: '2026-03-10T08:00:00.000Z' });
    // A renewal not mirrored yet: the calendar month, never a period in the past.
    expect(periodOf(paid, new Date('2026-03-11T00:00:00Z'))).toEqual({ start: '2026-03-01T00:00:00.000Z', end: '2026-04-01T00:00:00.000Z' });
    expect(periodOf(row({ plan: 'free' }), new Date('2026-12-31T23:59:59Z')).end).toBe('2027-01-01T00:00:00.000Z');
  });

  it('formats the soft-warning header only when something is at 80 percent', () => {
    const usage: Usage = {
      plan: 'free',
      period_start: '2026-02-01T00:00:00.000Z',
      period_end: '2026-03-01T00:00:00.000Z',
      metrics: { messages: { used: 800, limit: 1000 } },
      warnings: [
        { metric: 'messages', used: 800, limit: 1000, level: 'approaching' },
        { metric: 'providers', used: 1, limit: 1, level: 'reached' },
      ],
    };
    expect(usageWarningHeader(usage)).toBe('messages=800/1000,providers=1/1');
    expect(usageWarningHeader({ ...usage, warnings: [] })).toBeNull();
  });
});

describe('the Stripe client', () => {
  it('maps a network failure to status 0 and a Stripe error to its status and code, without the key in the message', async () => {
    const down = createStripeApi(fake('sk_test'), { fetch: async () => { throw new TypeError('fetch failed'); } });
    await expect(down.getSubscription('sub_1')).rejects.toMatchObject({ status: 0 });
    const key = fake('sk_test');
    const refusing = createStripeApi(key, {
      fetch: async () => new Response(JSON.stringify({ error: { message: 'No such price', code: 'resource_missing' } }), { status: 400 }),
    });
    const err = await refusing.createPortalSession({ customerId: 'cus_1', returnUrl: 'https://x.test' }).catch((e) => e);
    expect(err).toBeInstanceOf(StripeRequestError);
    expect(err).toMatchObject({ status: 400, stripeCode: 'resource_missing' });
    expect(String(err.message)).not.toContain(key);
    // A 404 on a subscription read is "no such subscription", not an error.
    const missing = createStripeApi('sk_test_x', { fetch: async () => new Response('{"error":{"message":"gone"}}', { status: 404 }) });
    expect(await missing.getSubscription('sub_gone')).toBeNull();
  });
});

describe('billing configuration', () => {
  const base = {
    DATABASE_URL: 'postgres://u:p@localhost:5432/mail',
    DASHBOARD_SERVICE_TOKEN: 'ab'.repeat(32),
    MAIL_SECRETS_KEY: 'cd'.repeat(32),
    PUBLIC_BASE_URL: 'https://mail.lumitra.co',
    STORAGE_BRAIN_API_KEY: `sk_test_${'x'.repeat(32)}`,
    MAIL_UNSUBSCRIBE_KEY: 'ef'.repeat(32),
    MAIL_ERASURE_WEBHOOK_SECRET: '12'.repeat(32),
  };

  it('treats unset, empty and the Infisical placeholder as not configured', () => {
    expect(loadConfig(base).billing).toEqual({ secretKey: undefined, webhookSecret: undefined, prices: { starter: undefined, growth: undefined }, portalConfigurationId: undefined });
    const placeholders = loadConfig({ ...base, STRIPE_SECRET_KEY: 'PLACEHOLDER_REPLACE_ME', STRIPE_WEBHOOK_SECRET: '', STRIPE_PRICE_STARTER_ID: 'PLACEHOLDER_REPLACE_ME' });
    expect(placeholders.billing.secretKey).toBeUndefined();
    expect(placeholders.billing.webhookSecret).toBeUndefined();
    expect(placeholders.billing.prices.starter).toBeUndefined();
  });

  it('reads real values and names a malformed one without echoing it', () => {
    const secretKey = fake('sk_test');
    const webhookSecret = fake('whsec');
    const full = loadConfig({
      ...base,
      STRIPE_SECRET_KEY: secretKey,
      STRIPE_WEBHOOK_SECRET: webhookSecret,
      STRIPE_PRICE_STARTER_ID: 'price_1Abc',
      STRIPE_PRICE_GROWTH_ID: 'price_1Def',
      STRIPE_PORTAL_CONFIGURATION_ID: 'bpc_1Ghi',
    });
    expect(full.billing).toEqual({
      secretKey,
      webhookSecret,
      prices: { starter: 'price_1Abc', growth: 'price_1Def' },
      portalConfigurationId: 'bpc_1Ghi',
    });
    // A publishable key in the secret's place: refused, and never echoed.
    const publishable = fake('pk_live');
    try {
      loadConfig({ ...base, STRIPE_SECRET_KEY: publishable, STRIPE_PRICE_GROWTH_ID: 'prod_123' });
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(ConfigError);
      const problems = (err as ConfigError).problems.join('\n');
      expect(problems).toContain('STRIPE_SECRET_KEY');
      expect(problems).toContain('STRIPE_PRICE_GROWTH_ID');
      expect(problems).not.toContain(publishable);
    }
  });
});

describe('the Stripe scripts', () => {
  it('register exactly the events the webhook handles, on the pinned API version', () => {
    const script = readFileSync(new URL('../../scripts/stripe-setup.mjs', import.meta.url), 'utf8');
    const events = /const EVENTS = \[([^\]]*)\]/.exec(script)![1]!.match(/'([^']+)'/g)!.map((e) => e.slice(1, -1));
    expect(events).toEqual([...STRIPE_WEBHOOK_EVENTS]);
    expect(script).toContain(`const API_VERSION = '${STRIPE_API_VERSION}'`);
  });

  it('the catalogue amounts are the plans\' displayed prices', () => {
    const script = readFileSync(new URL('../../scripts/stripe-setup.mjs', import.meta.url), 'utf8');
    expect(script).toContain(`lookupKey: 'mail-starter-monthly', product: 'mail-starter', amount: ${PLANS.starter.monthly_price_cents},`);
    expect(script).toContain(`lookupKey: 'mail-growth-monthly', product: 'mail-growth', amount: ${PLANS.growth.monthly_price_cents},`);
  });
});
