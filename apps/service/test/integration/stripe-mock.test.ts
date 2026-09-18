import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createStripeApi, type StripeApi } from '../../src/billing/stripe.js';
import { startStripeMock } from '../support/stripe-mock.js';

/**
 * The real Stripe client against stripe-mock (Stripe's own mock, which
 * validates every request against Stripe's OpenAPI description and answers
 * with fixture objects). It proves the parameters this service sends are ones
 * Stripe accepts; the lifecycle itself is in billing.test.ts over a stateful
 * fake, because stripe-mock keeps no state.
 */
let stop: (() => Promise<void>) | undefined;
let stripe: StripeApi;
let mockBase = '';

beforeAll(async () => {
  const mock = await startStripeMock();
  stop = mock.stop;
  mockBase = mock.base;
  stripe = createStripeApi('sk_test_123', { baseUrl: `${mockBase}/v1` });
}, 120_000);
afterAll(() => stop?.());

describe('the Stripe client against stripe-mock', () => {
  it('creates a tagged customer', async () => {
    const customer = await stripe.createCustomer({ workspaceId: '0b8f6a3e-4c1d-4e2f-9a7b-1c2d3e4f5a6b', name: 'Studio', idempotencyKey: `c-${Date.now()}` });
    expect(customer.id).toMatch(/^cus_/);
  });

  it('creates a subscription Checkout Session with every parameter the service sends', async () => {
    const session = await stripe.createCheckoutSession({
      workspaceId: '0b8f6a3e-4c1d-4e2f-9a7b-1c2d3e4f5a6b',
      customerId: 'cus_123',
      priceId: 'price_123',
      plan: 'starter',
      successUrl: 'https://studio.test/billing?ok',
      cancelUrl: 'https://studio.test/billing?no',
      idempotencyKey: `s-${Date.now()}`,
    });
    expect(session.id).toMatch(/^cs_/);
    expect(session.url).toMatch(/^https:\/\//);
  });

  it('creates a portal session, with and without a configuration', async () => {
    expect((await stripe.createPortalSession({ customerId: 'cus_123', returnUrl: 'https://studio.test/billing' })).url).toMatch(/^https:\/\//);
    expect((await stripe.createPortalSession({ customerId: 'cus_123', returnUrl: 'https://studio.test/billing', configurationId: 'bpc_123' })).url).toMatch(/^https:\/\//);
  });

  it('reads a subscription and lists a customer\'s subscriptions of any status', async () => {
    const sub = await stripe.getSubscription('sub_123');
    expect(sub?.id).toMatch(/^sub_/);
    expect(sub?.items.data[0]?.price.id).toMatch(/^price_/);
    const list = await stripe.listSubscriptions('cus_123');
    expect(Array.isArray(list)).toBe(true);
  });

  it('a parameter Stripe does not know is refused, so the checks above are real', async () => {
    const res = await fetch(`${mockBase}/v1/customers`, {
      method: 'POST',
      headers: { authorization: `Basic ${Buffer.from('sk_test_123:').toString('base64')}`, 'content-type': 'application/x-www-form-urlencoded' },
      body: 'not_a_stripe_parameter=1',
    });
    expect(res.status).toBe(400);
  });
});
