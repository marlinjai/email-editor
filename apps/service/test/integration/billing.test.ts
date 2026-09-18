import { billingRoutes, RETRYABLE_ERRORS, routes, USAGE_WARNING_HEADER, type OperationId } from '@marlinjai/mail-contract';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { setExemption } from '../../src/billing/exempt.js';
import { createStripeApi } from '../../src/billing/stripe.js';
import { reconcileWorkspace, startReconcileLoop } from '../../src/billing/sync.js';
import { repos } from '../../src/repo/index.js';
import { appOver } from '../support/app-call.js';
import { FakeStripe, PRICE_GROWTH, PRICE_STARTER, signedDelivery, TEST_BILLING_CONFIG } from '../support/fake-stripe.js';
import { startHarness, type Harness } from '../support/harness.js';
import { action, addRecipients, createMailing, makeWorker, recipientsOf, seedContact, seedSending } from '../support/sending.js';

/**
 * S5, billing: plans, the subscription lifecycle against a stateful Stripe
 * stand-in (test/support/fake-stripe.ts, at the fetch level, so the real
 * client runs), the signed webhook with exactly-once processing, metering from
 * the send ledger, limits with the mid-mailing rule, the free tier, the
 * design-partner exemption, and tenancy.
 */

let h: Harness;
let stripe: FakeStripe;
let app: ReturnType<typeof appOver>;
beforeAll(async () => {
  h = await startHarness();
});
afterAll(() => h?.drop());
beforeEach(() => {
  stripe = new FakeStripe();
  app = appOver(h, { billing: TEST_BILLING_CONFIG, stripe: createStripeApi(TEST_BILLING_CONFIG.secretKey, { fetch: stripe.fetch }) });
});

let n = 0;
async function freeWorkspace(prefix = 'bill') {
  return h.seedWorkspace(`${prefix}-${++n}`, { billing: 'free' });
}
type W = Awaited<ReturnType<typeof freeWorkspace>>;

const owner = (w: W) => ({ subject: w.owner, workspace: w.id });
const deliver = (event: unknown, options: Parameters<typeof signedDelivery>[1] = {}) =>
  app.call({ method: 'POST', path: '/stripe/webhook', ...signedDelivery(event, options) });
const subscription = (w: W) => app.call({ path: '/v1/billing/subscription', ...owner(w) });
const usage = (w: W) => app.call({ path: '/v1/billing/usage', key: w.key });
const checkout = (w: W, plan: 'starter' | 'growth', extra: Record<string, unknown> = {}) =>
  app.call({
    method: 'POST',
    path: '/v1/billing/checkout',
    ...owner(w),
    body: { plan, success_url: 'https://studio.test/billing?ok', cancel_url: 'https://studio.test/billing?no', ...extra },
  });
const portal = (w: W) => app.call({ method: 'POST', path: '/v1/billing/portal', ...owner(w), body: { return_url: 'https://studio.test/billing' } });
const lastSessionId = () => [...stripe.sessions.keys()].at(-1)!;
const auditActions = async (w: W) =>
  (await h.sql<{ action: string }[]>`SELECT action FROM audit_log WHERE workspace_id = ${w.id} AND action LIKE 'billing.%' ORDER BY created_at`).map((r) => r.action);

/** Subscribes through the whole forward path: checkout, the customer pays, Stripe's events arrive. */
async function subscribe(w: W, plan: 'starter' | 'growth') {
  const res = await checkout(w, plan);
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  const { sub, completed, subCreated } = stripe.completeCheckout(lastSessionId());
  expect((await deliver(completed)).status).toBe(200);
  expect((await deliver(subCreated)).status).toBe(200);
  return sub;
}

/** Puts recipients on the workspace's send ledger for this period, as sends would. */
async function spend(w: W, providerId: string, recipients: number) {
  await repos(h.sql).providerSends.record(w.id, providerId, recipients);
}

/** A topic and a provider whose own daily budget never gets in the way of the plan's. */
function sendingFor(w: W) {
  return seedSending(h, w.id, { policy: { daily_recipient_budget: 1_000_000 } });
}

/** A mailing on the workspace's provider with `count` subscribed recipients, still a draft. */
async function draftWith(w: W, sending: Awaited<ReturnType<typeof seedSending>>, count: number) {
  const mailing = await createMailing(h, w, { topic: sending.topic.slug, provider_id: sending.provider.id });
  const emails = Array.from({ length: count }, (_, i) => `r${i}-${mailing.id.slice(0, 8)}@example.test`);
  for (const email of emails) await seedContact(h, w.id, sending.topic.id, { email });
  const added = await addRecipients(h, w, mailing.id, emails.map((email) => ({ email })));
  expect(added.status, JSON.stringify(added.body)).toBe(200);
  return mailing;
}

describe('plans and the free tier', () => {
  it('lists the free plan and the two sold plans with limits and features; the design-partner plan is not for sale', async () => {
    const w = await freeWorkspace();
    const res = await app.call({ path: '/v1/billing/plans', key: w.key });
    expect(res.status).toBe(200);
    expect(res.body.data.map((p: any) => p.id)).toEqual(['free', 'starter', 'growth']);
    const free = res.body.data[0];
    expect(free).toMatchObject({ monthly_price_cents: 0, features: { ab_testing: false, tracking: false } });
    expect(free.limits.monthly_messages).toBe(1000);
  });

  it('a new workspace is on the free plan for the calendar month, exempt from nothing', async () => {
    const w = await freeWorkspace();
    const res = await subscription(w);
    expect(res.status).toBe(200);
    const now = new Date();
    expect(res.body).toMatchObject({
      workspace_id: w.id,
      plan: 'free',
      status: 'active',
      cancel_at_period_end: false,
      billing_exempt: false,
      current_period_start: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString(),
    });
    // No Stripe call for a workspace that never had a customer.
    expect(stripe.requests).toHaveLength(0);
  });

  it('meters messages from the send ledger for this period only, and counts the rest', async () => {
    const w = await freeWorkspace();
    const other = await freeWorkspace();
    const sending = await sendingFor(w);
    const otherSending = await sendingFor(other);
    await spend(w, sending.provider.id, 120);
    await spend(other, otherSending.provider.id, 7);
    // Last month's sends are not this period's.
    await h.sql`INSERT INTO provider_sends (workspace_id, provider_id, recipients, created_at)
      VALUES (${w.id}, ${sending.provider.id}, 500, date_trunc('month', now()) - interval '1 day')`;
    await seedContact(h, w.id, sending.topic.id, { email: 'one@example.test' });

    const res = await usage(w);
    expect(res.status).toBe(200);
    expect(res.body.plan).toBe('free');
    expect(res.body.metrics).toEqual({
      messages: { used: 120, limit: 1000 },
      contacts: { used: 1, limit: 500 },
      members: { used: 1, limit: 2 },
      providers: { used: 1, limit: 1 },
      webhook_endpoints: { used: 0, limit: 1 },
    });
    // At its limit, providers is reported as reached; nothing else is near.
    expect(res.body.warnings).toEqual([{ metric: 'providers', used: 1, limit: 1, level: 'reached' }]);
    expect((await usage(other)).body.metrics.messages.used).toBe(7);
  });
});

describe('limits', () => {
  it('warns softly at 80 percent: on usage, and in a header on the send', async () => {
    const w = await freeWorkspace();
    const sending = await sendingFor(w);
    await spend(w, sending.provider.id, 795);
    const mailing = await draftWith(w, sending, 10);
    const sent = await action(h, w, mailing.id, 'send');
    expect(sent.status, JSON.stringify(sent.body)).toBe(202);
    // 795 sent + 10 about to go is not in the ledger yet; the ledger alone says 795.
    await makeWorker(h).drain();
    const res = await usage(w);
    expect(res.body.warnings).toContainEqual({ metric: 'messages', used: 805, limit: 1000, level: 'approaching' });
    const second = await draftWith(w, sending, 1);
    const again = await action(h, w, second.id, 'send');
    expect(again.status).toBe(202);
    expect(again.headers.get(USAGE_WARNING_HEADER)).toContain('messages=805/1000');
  });

  it('refuses a mailing that does not fit whole, as plan_limit_reached (429, not retryable), and moves nothing', async () => {
    const w = await freeWorkspace();
    const sending = await sendingFor(w);
    await spend(w, sending.provider.id, 995);
    const mailing = await draftWith(w, sending, 6);
    const res = await action(h, w, mailing.id, 'send');
    expect(res.status).toBe(429);
    expect(res.body.error).toMatchObject({
      code: 'plan_limit_reached',
      details: { metric: 'messages', used: 995, pending: 0, requested: 6, limit: 1000, plan: 'free' },
    });
    expect(RETRYABLE_ERRORS).not.toContain('plan_limit_reached');
    const after = await h.call({ path: `/v1/mailings/${mailing.id}`, key: w.key });
    expect(after.body.status).toBe('draft');
  });

  it('mid-mailing: an accepted mailing always finishes, while new sends and tests are refused meanwhile', async () => {
    const w = await freeWorkspace();
    const sending = await sendingFor(w);
    await spend(w, sending.provider.id, 990);
    const first = await draftWith(w, sending, 10);
    expect((await action(h, w, first.id, 'send')).status).toBe(202);

    // The first mailing holds the last 10 of the period: nothing else fits.
    const second = await draftWith(w, sending, 1);
    const refused = await action(h, w, second.id, 'send');
    expect(refused.status).toBe(429);
    expect(refused.body.error.details).toMatchObject({ used: 990, pending: 10, requested: 1 });
    const test = await action(h, w, second.id, 'test', { to: 'me@studio.test' });
    expect(test.status).toBe(429);

    // Pause and resume mid-mailing are never checked: the audience finishes.
    expect((await action(h, w, first.id, 'pause')).status).toBe(200);
    expect((await action(h, w, first.id, 'resume')).status).toBe(202);
    await makeWorker(h).drain();
    const rows = await recipientsOf(h, w.id, first.id);
    expect(rows.map((r) => r.status)).toEqual(Array(10).fill('sent'));
    expect((await usage(w)).body.metrics.messages).toEqual({ used: 1000, limit: 1000 });
    expect((await action(h, w, second.id, 'send')).status).toBe(429);
  });

  it('a mailing that was already sending when the period filled up still finishes (limits are never checked by the worker)', async () => {
    const w = await freeWorkspace();
    const sending = await sendingFor(w);
    const mailing = await draftWith(w, sending, 5);
    expect((await action(h, w, mailing.id, 'send')).status).toBe(202);
    // Test sends and other traffic on the provider fill the period after the mailing started.
    await spend(w, sending.provider.id, 1000);
    await makeWorker(h).drain();
    expect((await recipientsOf(h, w.id, mailing.id)).every((r) => r.status === 'sent')).toBe(true);
  });

  it('counts contacts, members, providers and webhook endpoints; an update never counts, a refused insert rolls back', async () => {
    const w = await freeWorkspace();
    const sending = await sendingFor(w);
    // 499 contacts through the repository, the 500th over the API.
    await h.sql`INSERT INTO contacts (workspace_id, email) SELECT ${w.id}, 'c' || g || '@example.test' FROM generate_series(1, 499) g`;
    const last = await h.call({ method: 'POST', path: '/v1/contacts', key: w.key, body: { email: 'last@example.test' } });
    expect(last.status, JSON.stringify(last.body)).toBe(200);
    const over = await h.call({ method: 'POST', path: '/v1/contacts', key: w.key, body: { email: 'over@example.test' } });
    expect(over.status).toBe(429);
    expect(over.body.error.details).toMatchObject({ metric: 'contacts', limit: 500 });
    expect((await h.sql`SELECT 1 FROM contacts WHERE workspace_id = ${w.id} AND email = 'over@example.test'`).length).toBe(0);
    // Updating an existing contact is not a new one.
    const update = await h.call({ method: 'POST', path: '/v1/contacts', key: w.key, body: { email: 'last@example.test', first_name: 'Last' } });
    expect(update.status).toBe(200);

    // A recipient batch that would create contacts past the limit is refused whole.
    const mailing = await createMailing(h, w, { topic: sending.topic.slug, provider_id: sending.provider.id });
    const batch = await addRecipients(h, w, mailing.id, [{ email: 'c1@example.test' }, { email: 'brand-new@example.test' }]);
    expect(batch.status).toBe(429);
    expect((await recipientsOf(h, w.id, mailing.id)).length).toBe(0);

    const member = await h.call({ method: 'POST', path: '/v1/members', ...owner(w), body: { subject: 'second', email: 'second@example.test', role: 'viewer' } });
    expect(member.status).toBe(201);
    const third = await h.call({ method: 'POST', path: '/v1/members', ...owner(w), body: { subject: 'third', email: 'third@example.test', role: 'viewer' } });
    expect(third.status).toBe(429);
    expect(third.body.error.details).toMatchObject({ metric: 'members', limit: 2 });

    const provider = await h.call({
      method: 'POST',
      path: '/v1/providers',
      key: w.key,
      body: {
        kind: 'resend',
        name: 'Second',
        config: { api_key: 're_second' },
        from_name: 'S',
        from_email: 's@example.com',
        reply_to: 'reply@example.com',
        policy: { daily_recipient_budget: 100, min_interval_ms: 0, max_recipients_per_message: 1 },
      },
    });
    expect(provider.status).toBe(429);
    expect(provider.body.error.details).toMatchObject({ metric: 'providers', limit: 1 });
    expect((await usage(w)).body.metrics.providers.used).toBe(1);

    const open = appOver(h, { webhookUrlPolicy: { allowInsecureHttp: true, allowPrivateTargets: true } });
    const hook = (path: string) =>
      open.call({ method: 'POST', path: '/v1/webhooks', key: w.key, body: { url: `http://127.0.0.1:9/${path}`, events: ['mailing.finished'] } });
    expect((await hook('one')).status).toBe(201);
    const secondHook = await hook('two');
    expect(secondHook.status).toBe(429);
    expect(secondHook.body.error.details).toMatchObject({ metric: 'webhook_endpoints', limit: 1 });
  });

  it('turning tracking on needs a plan with it', async () => {
    const w = await freeWorkspace();
    const res = await h.call({ method: 'PATCH', path: '/v1/workspace', ...owner(w), body: { settings: { tracking_enabled: true } } });
    expect(res.status).toBe(429);
    expect(res.body.error.details).toEqual({ feature: 'tracking', plan: 'free' });
  });
});

describe('the Stripe webhook', () => {
  it('fails closed without a webhook secret: 503, never 200, so Stripe retries', async () => {
    const unconfigured = appOver(h);
    const res = await unconfigured.call({ method: 'POST', path: '/stripe/webhook', ...signedDelivery(stripe.event('invoice.paid', {})) });
    expect(res.status).toBe(503);
  });

  it('refuses a missing, wrong, stale or tampered signature', async () => {
    const event = stripe.event('customer.subscription.updated', { id: 'sub_x', customer: 'cus_x', metadata: { product: 'mail' } });
    const body = JSON.stringify(event);
    expect((await app.call({ method: 'POST', path: '/stripe/webhook', rawBody: body })).status).toBe(400);
    expect((await deliver(event, { secret: 'whsec_somebodyelsesendpointsecret' })).status).toBe(400);
    expect((await deliver(event, { timestamp: Math.floor(Date.now() / 1000) - 301 })).status).toBe(400);
    const signed = signedDelivery(event);
    const tampered = await app.call({ method: 'POST', path: '/stripe/webhook', rawBody: body.replace('sub_x', 'sub_y'), headers: signed.headers });
    expect(tampered.status).toBe(400);
    expect((await h.sql`SELECT 1 FROM stripe_events`).length).toBe(0);
  });

  it('processes an event exactly once: a replay changes nothing and asks Stripe nothing', async () => {
    const w = await freeWorkspace();
    await checkout(w, 'starter');
    const { completed } = stripe.completeCheckout(lastSessionId());
    const first = await deliver(completed);
    expect(first.body).toEqual({ received: true, outcome: 'applied' });
    const reads = stripe.count('GET', '/subscriptions');
    const replay = await deliver(completed);
    expect(replay.status).toBe(200);
    expect(replay.body).toMatchObject({ received: true, replay: true });
    expect(stripe.count('GET', '/subscriptions')).toBe(reads);
    expect(await auditActions(w)).toEqual(['billing.checkout_started', 'billing.subscription_changed']);
    const rows = await h.sql`SELECT id, outcome, workspace_id FROM stripe_events WHERE id = ${completed.id}`;
    expect(rows).toEqual([{ id: completed.id, outcome: 'applied', workspace_id: w.id }]);
  });

  it('two deliveries of one event racing apply it once', async () => {
    const w = await freeWorkspace();
    await checkout(w, 'starter');
    const { completed } = stripe.completeCheckout(lastSessionId());
    const [a, b] = await Promise.all([deliver(completed), deliver(completed)]);
    expect([a.status, b.status]).toEqual([200, 200]);
    expect(await auditActions(w)).toEqual(['billing.checkout_started', 'billing.subscription_changed']);
  });

  it("drops another product's events on the shared account without recording them", async () => {
    const qr = stripe.event('checkout.session.completed', { id: 'cs_qr', customer: 'cus_qr', metadata: { product: 'qr', user_id: 'u1' } });
    const res = await deliver(qr);
    expect(res.body).toEqual({ received: true, ignored: 'other_product' });
    const untagged = stripe.event('customer.subscription.deleted', { id: 'sub_legacy', customer: 'cus_legacy' });
    expect((await deliver(untagged)).body).toEqual({ received: true, ignored: 'not_ours' });
    expect((await h.sql`SELECT 1 FROM stripe_events WHERE id IN (${qr.id}, ${untagged.id})`).length).toBe(0);
  });

  it('an event naming a workspace its customer does not belong to is not applied (tenancy)', async () => {
    const a = await freeWorkspace();
    const b = await freeWorkspace();
    await checkout(a, 'growth');
    const { completed } = stripe.completeCheckout(lastSessionId());
    // Forge the metadata: the customer is a's, the event claims b.
    completed.data.object.metadata = { ...completed.data.object.metadata, workspace_id: b.id };
    completed.data.object.client_reference_id = b.id;
    const res = await deliver(completed);
    expect(res.body.ignored).toBe('unknown_workspace');
    expect((await subscription(b)).body.plan).toBe('free');
    expect((await h.sql`SELECT outcome FROM stripe_events WHERE id = ${completed.id}`)[0]).toEqual({ outcome: 'unknown_workspace' });
  });

  it('a Stripe outage while applying answers 500 and records nothing, so the retry applies it', async () => {
    const w = await freeWorkspace();
    await checkout(w, 'starter');
    const { completed } = stripe.completeCheckout(lastSessionId());
    stripe.failNext(0);
    expect((await deliver(completed)).status).toBe(500);
    expect((await h.sql`SELECT 1 FROM stripe_events WHERE id = ${completed.id}`).length).toBe(0);
    expect((await deliver(completed)).body.outcome).toBe('applied');
    expect((await subscription(w)).body.plan).toBe('starter');
  });

  it('a subscription on a Price no plan is configured with is refused loudly (500), never guessed', async () => {
    const w = await freeWorkspace();
    await checkout(w, 'starter');
    const { sub, completed } = stripe.completeCheckout(lastSessionId());
    sub.items.data[0]!.price = { id: 'price_somethingelse' };
    expect((await deliver(completed)).status).toBe(500);
    expect((await subscription(w)).body.plan).toBe('free');
  });
});

describe('checkout and the portal', () => {
  it('fails closed without Stripe or without the plan Price: 503 before anything is written', async () => {
    const w = await freeWorkspace();
    const noStripe = appOver(h);
    const res = await noStripe.call({
      method: 'POST',
      path: '/v1/billing/checkout',
      ...owner(w),
      body: { plan: 'starter', success_url: 'https://s.test/ok', cancel_url: 'https://s.test/no' },
    });
    expect(res.status).toBe(503);
    expect(res.body.error.details).toEqual({ reason: 'billing_not_configured' });
    const noPrice = appOver(h, {
      billing: { ...TEST_BILLING_CONFIG, prices: { starter: PRICE_STARTER } },
      stripe: createStripeApi(TEST_BILLING_CONFIG.secretKey, { fetch: stripe.fetch }),
    });
    const growth = await noPrice.call({
      method: 'POST',
      path: '/v1/billing/checkout',
      ...owner(w),
      body: { plan: 'growth', success_url: 'https://s.test/ok', cancel_url: 'https://s.test/no' },
    });
    expect(growth.status).toBe(503);
    expect(stripe.requests).toHaveLength(0);
    expect((await repos(h.sql).billing.get(w.id))!.stripe_customer_id).toBeNull();
    expect(await auditActions(w)).toEqual([]);
  });

  it('creates one tagged customer per workspace and a tagged Checkout Session on the configured Price', async () => {
    const w = await freeWorkspace();
    const res = await checkout(w, 'growth');
    expect(res.status).toBe(200);
    expect(res.body.url).toMatch(/^https:\/\/checkout\.stripe\.test\//);
    const customerCall = stripe.requests.find((r) => r.path === '/customers')!;
    expect(customerCall.form).toMatchObject({ 'metadata[product]': 'mail', 'metadata[workspace_id]': w.id });
    expect(customerCall.headers['stripe-version']).toBe('2025-03-31.basil');
    const session = stripe.requests.find((r) => r.path === '/checkout/sessions')!;
    expect(session.form).toMatchObject({
      mode: 'subscription',
      'line_items[0][price]': PRICE_GROWTH,
      client_reference_id: w.id,
      'metadata[product]': 'mail',
      'subscription_data[metadata][product]': 'mail',
      'subscription_data[metadata][workspace_id]': w.id,
    });
    // A second checkout (the person came back) reuses the customer.
    expect((await checkout(w, 'starter')).status).toBe(200);
    expect(stripe.count('POST', '/customers')).toBe(1);
  });

  it('a retried checkout with the same Idempotency-Key gets the same session', async () => {
    const w = await freeWorkspace();
    const call = () =>
      app.call({
        method: 'POST',
        path: '/v1/billing/checkout',
        ...owner(w),
        idempotencyKey: 'checkout-1',
        body: { plan: 'starter', success_url: 'https://s.test/ok', cancel_url: 'https://s.test/no' },
      });
    const [a, b] = [await call(), await call()];
    expect(b.body.url).toBe(a.body.url);
    expect(stripe.sessions.size).toBe(1);
  });

  it('Stripe down is provider_error (502), with nothing recorded', async () => {
    const w = await freeWorkspace();
    stripe.failNext(500);
    const res = await checkout(w, 'starter');
    expect(res.status).toBe(502);
    expect(res.body.error).toMatchObject({ code: 'provider_error', details: { service: 'stripe', status: 500 } });
    expect(await auditActions(w)).toEqual([]);
  });

  it('the portal needs a billing account first', async () => {
    const w = await freeWorkspace();
    const res = await portal(w);
    expect(res.status).toBe(409);
    expect(res.body.error.details).toEqual({ use: 'billing.checkout' });
  });
});

describe('the subscription lifecycle (four paths)', () => {
  it('forward: checkout, payment, webhook; the new limits apply at once', async () => {
    const w = await freeWorkspace();
    const sub = await subscribe(w, 'starter');
    const res = await subscription(w);
    expect(res.body).toMatchObject({ plan: 'starter', status: 'active', cancel_at_period_end: false, billing_exempt: false });
    const item = sub.items.data[0]!;
    expect(res.body.current_period_start).toBe(new Date(item.current_period_start! * 1000).toISOString());
    expect(res.body.current_period_end).toBe(new Date(item.current_period_end! * 1000).toISOString());
    expect((await usage(w)).body.metrics.providers.limit).toBe(2);
    // Tracking comes with the plan.
    expect((await h.call({ method: 'PATCH', path: '/v1/workspace', ...owner(w), body: { settings: { tracking_enabled: true } } })).status).toBe(200);
    // Subscribed: a second checkout is refused, the portal is the way to change.
    const again = await checkout(w, 'growth');
    expect(again.status).toBe(409);
    expect(again.body.error.details).toMatchObject({ use: 'billing.portal' });
    expect((await portal(w)).body.url).toMatch(/^https:\/\/billing\.stripe\.test\//);
  });

  it('backtrack and revise: up to growth and back down to starter in the portal; events out of order converge', async () => {
    const w = await freeWorkspace();
    const sub = await subscribe(w, 'starter');
    const up = stripe.switchPrice(sub.id, PRICE_GROWTH);
    const down = stripe.switchPrice(sub.id, PRICE_STARTER);
    // The later change arrives first; the earlier one after it must not undo it,
    // since both re-read Stripe's current state.
    await deliver(down);
    await deliver(up);
    expect((await subscription(w)).body.plan).toBe('starter');
    const up2 = stripe.switchPrice(sub.id, PRICE_GROWTH);
    expect((await deliver(up2)).body.outcome).toBe('applied');
    expect((await usage(w)).body.plan).toBe('growth');

    // Down with more members than the smaller plan allows: nobody is removed,
    // new members are refused until the count fits.
    for (const i of [1, 2, 3, 4, 5]) {
      expect((await h.call({ method: 'POST', path: '/v1/members', ...owner(w), body: { subject: `m${i}`, email: `m${i}@x.test`, role: 'viewer' } })).status).toBe(201);
    }
    await deliver(stripe.switchPrice(sub.id, PRICE_STARTER));
    expect((await usage(w)).body.metrics.members).toEqual({ used: 6, limit: 5 });
    const refused = await h.call({ method: 'POST', path: '/v1/members', ...owner(w), body: { subject: 'm6', email: 'm6@x.test', role: 'viewer' } });
    expect(refused.status).toBe(429);
    const changes = (await h.sql<{ details: any }[]>`
      SELECT details FROM audit_log WHERE workspace_id = ${w.id} AND action = 'billing.subscription_changed' ORDER BY created_at`).map((r) => r.details.to.plan);
    expect(changes).toEqual(['starter', 'growth', 'starter']);
  });

  it('resume from persistence: a missed webhook heals on the next read, by the loop, and survives a restart', async () => {
    const w = await freeWorkspace();
    await checkout(w, 'growth');
    stripe.completeCheckout(lastSessionId()); // Stripe's events never arrive.
    expect((await repos(h.sql).billing.get(w.id))!.plan).toBe('free');
    // The next read of the subscription sees a mirror that was never synced and asks Stripe.
    const read = await subscription(w);
    expect(read.body.plan).toBe('growth');
    expect(stripe.count('GET', '/subscriptions')).toBeGreaterThan(0);

    // The loop: a second workspace whose cancellation event was lost.
    const v = await freeWorkspace();
    const vsub = await subscribe(v, 'starter');
    stripe.setStatus(vsub.id, 'canceled'); // not delivered
    await h.sql`UPDATE workspace_billing SET stripe_synced_at = now() - interval '2 hours' WHERE workspace_id = ${v.id}`;
    const loop = startReconcileLoop(h.sql, createStripeApi('sk_test_x', { fetch: stripe.fetch }), TEST_BILLING_CONFIG, {
      everyMs: 3_600_000,
      log: { error: () => {}, log: () => {} },
    });
    await loop.runOnce();
    await loop.stop();
    expect((await repos(h.sql).billing.get(v.id))).toMatchObject({ plan: 'free', status: 'cancelled', stripe_subscription_id: null });

    // A new process over the same database reads the same state.
    const restarted = appOver(h, { billing: TEST_BILLING_CONFIG, stripe: createStripeApi('sk_test_x', { fetch: stripe.fetch }) });
    expect((await restarted.call({ path: '/v1/billing/subscription', ...owner(w) })).body.plan).toBe('growth');
  });

  it('resume: Stripe unreachable on a read serves the stored mirror and logs, never an error', async () => {
    const w = await freeWorkspace();
    await subscribe(w, 'starter');
    await h.sql`UPDATE workspace_billing SET stripe_synced_at = now() - interval '2 hours' WHERE workspace_id = ${w.id}`;
    stripe.failNext(0, 2);
    const res = await subscription(w);
    expect(res.status).toBe(200);
    expect(res.body.plan).toBe('starter');
    expect(app.logged.length).toBeGreaterThan(0);
  });

  it('re-entry: dunning keeps the plan, cancelling ends it, and subscribing again starts a new one', async () => {
    const w = await freeWorkspace();
    const first = await subscribe(w, 'growth');

    await deliver(stripe.paymentFailed(first.id));
    expect((await subscription(w)).body).toMatchObject({ plan: 'growth', status: 'past_due' });
    await deliver(stripe.setStatus(first.id, 'active'));
    await deliver(stripe.cancelAtPeriodEnd(first.id));
    expect((await subscription(w)).body).toMatchObject({ plan: 'growth', status: 'active', cancel_at_period_end: true });

    const ended = stripe.setStatus(first.id, 'canceled');
    await deliver(ended);
    expect((await subscription(w)).body).toMatchObject({ plan: 'free', status: 'cancelled', cancel_at_period_end: false });
    expect((await usage(w)).body.metrics.messages.limit).toBe(1000);

    const second = await subscribe(w, 'starter');
    expect(second.id).not.toBe(first.id);
    expect((await subscription(w)).body).toMatchObject({ plan: 'starter', status: 'active' });
    // A late copy of the old subscription's end must not end the new one.
    const late = stripe.subscriptionEvent('customer.subscription.deleted', stripe.subscriptions.get(first.id)!);
    await deliver(late);
    expect((await subscription(w)).body.plan).toBe('starter');
    // A renewal moves the mirrored period on.
    const before = (await repos(h.sql).billing.get(w.id))!.current_period_end;
    expect((await deliver(stripe.renew(second.id))).body.outcome).toBe('applied');
    expect((await repos(h.sql).billing.get(w.id))!.current_period_start).toBe(before);
  });
});

describe('the design-partner exemption', () => {
  it('lifts every limit, and neither checkout, the portal nor a Stripe event changes it', async () => {
    const w = await freeWorkspace('partner');
    const sending = await sendingFor(w);
    await setExemption(h.sql, w.id, true, 'OPUNTIA design partner, decided 2026-09-18');
    await spend(w, sending.provider.id, 5000);
    const mailing = await draftWith(w, sending, 3);
    expect((await action(h, w, mailing.id, 'send')).status).toBe(202);
    const res = await usage(w);
    expect(res.body.plan).toBe('design_partner');
    expect(res.body.metrics.messages).toEqual({ used: 5000, limit: null });
    expect(res.body.warnings).toEqual([]);
    expect((await subscription(w)).body).toMatchObject({ plan: 'design_partner', billing_exempt: true });
    expect((await checkout(w, 'starter')).status).toBe(409);
    expect((await portal(w)).status).toBe(409);
    expect(await auditActions(w)).toEqual(['billing.exemption_changed']);
  });

  it('cannot be set or lifted by an API key or a member, whatever the body says', async () => {
    const w = await freeWorkspace();
    const attempts = [
      await h.call({ method: 'PATCH', path: '/v1/workspace', key: w.key, body: { billing_exempt: true, plan: 'design_partner', settings: { billing_exempt: true } } }),
      await h.call({ method: 'PATCH', path: '/v1/workspace', ...owner(w), body: { billing_exempt: true, plan: 'design_partner' } }),
      await app.call({ method: 'POST', path: '/v1/billing/checkout', key: w.key, body: { plan: 'design_partner', success_url: 'https://s.test/a', cancel_url: 'https://s.test/b' } }),
    ];
    expect(attempts[2]!.status).toBe(400);
    for (const res of attempts) expect(JSON.stringify(res.body)).not.toContain('"billing_exempt":true');
    expect((await repos(h.sql).billing.get(w.id))).toMatchObject({ billing_exempt: false, plan: 'free' });
    // No route of the table writes it: none of them is even about it except the read-only subscription.
    const writers = (Object.keys(routes) as OperationId[]).filter((id) => /exempt/i.test(id));
    expect(writers).toEqual([]);
    // And the schema refuses the plan without the flag.
    await expect(h.sql`UPDATE workspace_billing SET plan = 'design_partner' WHERE workspace_id = ${w.id}`).rejects.toThrow(/check/i);
  });

  it('a Stripe event for an exempt workspace mirrors the subscription but keeps the plan; lifting it restores what Stripe says', async () => {
    const w = await freeWorkspace();
    const sub = await subscribe(w, 'starter');
    await setExemption(h.sql, w.id, true, 'moved to design partner');
    await deliver(stripe.switchPrice(sub.id, PRICE_GROWTH));
    expect((await subscription(w)).body.plan).toBe('design_partner');
    await expect(setExemption(h.sql, w.id, true, '   ')).rejects.toThrow(/reason/);
    await setExemption(h.sql, w.id, false, 'partnership ended');
    // Dropped to free and marked stale; the next read re-reads Stripe.
    expect((await repos(h.sql).billing.get(w.id))!.plan).toBe('free');
    expect((await subscription(w)).body.plan).toBe('growth');
    expect(await reconcileWorkspace(h.sql, createStripeApi('sk_test_x', { fetch: stripe.fetch }), TEST_BILLING_CONFIG, w.id)).toBe(false);
  });
});

describe('tenancy and access', () => {
  it("a workspace sees only its own plan and usage, and B's spend never counts for A", async () => {
    const a = await freeWorkspace();
    const b = await freeWorkspace();
    await subscribe(b, 'growth');
    const bs = await sendingFor(b);
    await spend(b, bs.provider.id, 400);
    expect((await app.call({ path: '/v1/billing/subscription', key: a.key })).body).toMatchObject({ workspace_id: a.id, plan: 'free' });
    expect((await usage(a)).body.metrics.messages.used).toBe(0);
    // A dashboard caller naming B without being B's member is refused.
    expect((await app.call({ path: '/v1/billing/usage', subject: a.owner, workspace: b.id })).status).toBe(403);
    // A's portal never opens B's customer.
    expect((await portal(a)).status).toBe(409);
  });

  it('usage is readable by any key and viewer; the subscription, checkout and portal need admin', async () => {
    const w = await freeWorkspace();
    const read = await app.call({ method: 'POST', path: '/v1/api-keys', ...owner(w), body: { name: 'reader', scope: 'read' } });
    const readKey = read.body.key as string;
    expect((await app.call({ path: '/v1/billing/usage', key: readKey })).status).toBe(200);
    expect((await app.call({ path: '/v1/billing/plans', key: readKey })).status).toBe(200);
    expect((await app.call({ path: '/v1/billing/subscription', key: readKey })).status).toBe(403);
    const refused = await app.call({ method: 'POST', path: '/v1/billing/checkout', key: readKey, body: { plan: 'starter', success_url: 'https://s.test/a', cancel_url: 'https://s.test/b' } });
    expect(refused.status).toBe(403);
    await app.call({ method: 'POST', path: '/v1/members', ...owner(w), body: { subject: 'viewer-1', email: 'v1@x.test', role: 'viewer' } });
    expect((await app.call({ path: '/v1/billing/usage', subject: 'viewer-1', workspace: w.id })).status).toBe(200);
    expect((await app.call({ path: '/v1/billing/subscription', subject: 'viewer-1', workspace: w.id })).body.error.code).toBe('insufficient_role');
    // A revoked key is refused.
    await app.call({ method: 'DELETE', path: `/v1/api-keys/${read.body.api_key.id}`, ...owner(w) });
    expect((await app.call({ path: '/v1/billing/usage', key: readKey })).body.error.code).toBe('api_key_revoked');
  });
});

describe('contract conformance, S5 billing', () => {
  it('every billing operation answers with its declared status and response schema', async () => {
    const w = await freeWorkspace();
    const covered = new Set<OperationId>();
    const run = async (id: OperationId, res: { status: number; body: unknown }) => {
      expect(res.status, `${id}: ${JSON.stringify(res.body)}`).toBe(routes[id].status);
      const parsed = routes[id].response.safeParse(res.body);
      expect(parsed.success, `${id}: ${parsed.success ? '' : JSON.stringify(parsed.error.issues)}`).toBe(true);
      covered.add(id);
    };
    await run('billing.plans', await app.call({ path: '/v1/billing/plans', key: w.key }));
    await run('billing.usage', await usage(w));
    await run('billing.checkout', await checkout(w, 'starter'));
    await run('billing.subscription', await subscription(w));
    await run('billing.portal', await portal(w));
    expect([...covered].sort()).toEqual(Object.keys(billingRoutes).sort());
  });
});
