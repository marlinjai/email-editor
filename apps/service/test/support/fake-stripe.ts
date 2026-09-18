import type { StripeEvent, StripeSubscription } from '../../src/billing/stripe.js';
import { randomBytes } from 'node:crypto';
import { signStripePayload } from '../../src/billing/stripe.js';

/**
 * A stateful stand-in for the slice of the Stripe API the service calls, at the
 * fetch level, so the real client (`createStripeApi`: form encoding, headers,
 * idempotency keys, error mapping) is what the tests exercise. It records every
 * request, honours Idempotency-Key like Stripe, and lets a test play Stripe's
 * part: complete a checkout, switch or cancel a subscription, and emit the
 * events Stripe would send, signed with a known webhook secret.
 */

/**
 * Test-only credentials, made per run rather than written out, so no string
 * shaped like a real Stripe secret sits in the repository for a secret scanner
 * to flag. They open nothing: the fake below is the only thing that reads them.
 */
const fakeCredential = (prefix: string) => `${prefix}_${randomBytes(16).toString('hex')}`;
export const TEST_WEBHOOK_SECRET = fakeCredential('whsec');
export const PRICE_STARTER = 'price_starterTEST';
export const PRICE_GROWTH = 'price_growthTEST';
export const TEST_BILLING_CONFIG = {
  secretKey: fakeCredential('sk_test'),
  webhookSecret: TEST_WEBHOOK_SECRET,
  prices: { starter: PRICE_STARTER, growth: PRICE_GROWTH },
};

type Form = Record<string, string>;
type Recorded = { method: string; path: string; form: Form; headers: Record<string, string> };

const DAY = 86_400;

export class FakeStripe {
  readonly requests: Recorded[] = [];
  readonly customers = new Map<string, { id: string; metadata: Form }>();
  readonly sessions = new Map<string, { id: string; url: string; form: Form }>();
  readonly subscriptions = new Map<string, StripeSubscription>();
  private readonly idempotent = new Map<string, { status: number; body: unknown }>();
  private seq = 0;
  /** An hour back, so periods and events it stamps are never in the future of the service's clock. */
  private clock = Math.floor(Date.now() / 1000) - 3600;
  /** The next N requests answer this (a Stripe outage), or throw when 0 (network down). */
  private failures: number[] = [];

  failNext(status: number, times = 1) {
    for (let i = 0; i < times; i++) this.failures.push(status);
  }

  /** Unique across fakes too, like Stripe's: suites share one database. */
  private id(prefix: string) {
    this.seq++;
    return `${prefix}_${String(this.seq).padStart(6, '0')}${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
  }

  /** Seconds, advancing on every call, so every object and event is newer than the last. */
  private now() {
    return ++this.clock;
  }

  readonly fetch: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    const method = init?.method ?? 'GET';
    const headers = Object.fromEntries(Object.entries((init?.headers ?? {}) as Record<string, string>).map(([k, v]) => [k.toLowerCase(), v]));
    const form = Object.fromEntries(new URLSearchParams(typeof init?.body === 'string' ? init.body : '')) as Form;
    const path = url.pathname.replace(/^\/v1/, '');
    this.requests.push({ method, path: `${path}${url.search}`, form, headers });

    const failure = this.failures.shift();
    if (failure === 0) throw new TypeError('fetch failed');
    if (failure !== undefined) return json(failure, { error: { message: 'Stripe is having a moment', type: 'api_error' } });
    if (!headers.authorization?.startsWith('Basic ')) return json(401, { error: { message: 'no key' } });

    const key = headers['idempotency-key'];
    if (key && this.idempotent.has(key)) {
      const prior = this.idempotent.get(key)!;
      return json(prior.status, prior.body);
    }
    const answer = this.route(method, path, url.searchParams, form);
    if (key) this.idempotent.set(key, answer);
    return json(answer.status, answer.body);
  };

  private route(method: string, path: string, q: URLSearchParams, form: Form): { status: number; body: unknown } {
    if (method === 'POST' && path === '/customers') {
      const id = this.id('cus');
      const metadata = pick(form, 'metadata');
      this.customers.set(id, { id, metadata });
      return { status: 200, body: { id, object: 'customer', metadata } };
    }
    if (method === 'POST' && path === '/checkout/sessions') {
      if (!form.customer || !this.customers.has(form.customer)) return { status: 400, body: { error: { message: 'No such customer' } } };
      if (form['line_items[0][price]'] === undefined) return { status: 400, body: { error: { message: 'line_items required' } } };
      const id = this.id('cs');
      const session = { id, url: `https://checkout.stripe.test/c/${id}`, form };
      this.sessions.set(id, session);
      return { status: 200, body: { id, object: 'checkout.session', url: session.url } };
    }
    if (method === 'POST' && path === '/billing_portal/sessions') {
      if (!form.customer || !this.customers.has(form.customer)) return { status: 400, body: { error: { message: 'No such customer' } } };
      return { status: 200, body: { id: this.id('bps'), url: `https://billing.stripe.test/p/${form.customer}` } };
    }
    if (method === 'GET' && path.startsWith('/subscriptions/')) {
      const sub = this.subscriptions.get(decodeURIComponent(path.slice('/subscriptions/'.length)));
      return sub ? { status: 200, body: sub } : { status: 404, body: { error: { message: 'No such subscription', code: 'resource_missing' } } };
    }
    if (method === 'GET' && path === '/subscriptions') {
      const customer = q.get('customer');
      const data = [...this.subscriptions.values()].filter((s) => s.customer === customer);
      return { status: 200, body: { object: 'list', data, has_more: false } };
    }
    return { status: 404, body: { error: { message: `unrouted ${method} ${path}` } } };
  }

  /** The customer's side of Checkout: pays, and Stripe creates the subscription. Returns the events Stripe sends. */
  completeCheckout(sessionId: string, status: StripeSubscription['status'] = 'active') {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`no session ${sessionId}`);
    const created = this.now();
    const sub: StripeSubscription = {
      id: this.id('sub'),
      customer: session.form.customer!,
      status,
      cancel_at_period_end: false,
      metadata: pick(session.form, 'subscription_data[metadata]'),
      items: { data: [{ price: { id: session.form['line_items[0][price]']! }, current_period_start: created, current_period_end: created + 30 * DAY }] },
      created,
    };
    this.subscriptions.set(sub.id, sub);
    const completed = this.event('checkout.session.completed', {
      id: sessionId,
      object: 'checkout.session',
      customer: sub.customer,
      subscription: sub.id,
      client_reference_id: session.form.client_reference_id,
      metadata: pick(session.form, 'metadata'),
    });
    return { sub, completed, subCreated: this.subscriptionEvent('customer.subscription.created', sub) };
  }

  /** The portal's plan switch (Stripe prorates; the period stays). */
  switchPrice(subId: string, priceId: string) {
    const sub = this.subscriptions.get(subId)!;
    sub.items.data[0]!.price = { id: priceId };
    return this.subscriptionEvent('customer.subscription.updated', sub);
  }

  setStatus(subId: string, status: StripeSubscription['status']) {
    const sub = this.subscriptions.get(subId)!;
    sub.status = status;
    return this.subscriptionEvent(status === 'canceled' ? 'customer.subscription.deleted' : 'customer.subscription.updated', sub);
  }

  cancelAtPeriodEnd(subId: string) {
    const sub = this.subscriptions.get(subId)!;
    sub.cancel_at_period_end = true;
    return this.subscriptionEvent('customer.subscription.updated', sub);
  }

  /** A renewal: the period moves on, and Stripe sends invoice.paid. */
  renew(subId: string) {
    const sub = this.subscriptions.get(subId)!;
    const item = sub.items.data[0]!;
    item.current_period_start = item.current_period_end!;
    item.current_period_end = item.current_period_start + 30 * DAY;
    return this.invoiceEvent('invoice.paid', sub);
  }

  paymentFailed(subId: string) {
    const sub = this.subscriptions.get(subId)!;
    sub.status = 'past_due';
    return this.invoiceEvent('invoice.payment_failed', sub);
  }

  subscriptionEvent(type: string, sub: StripeSubscription) {
    return this.event(type, { ...structuredClone(sub), object: 'subscription' } as unknown as StripeEvent['data']['object']);
  }

  /** On the pinned API version (basil) an invoice carries the subscription under `parent`. */
  invoiceEvent(type: string, sub: StripeSubscription) {
    return this.event(type, {
      id: this.id('in'),
      object: 'invoice',
      customer: sub.customer,
      parent: { subscription_details: { subscription: sub.id, metadata: { ...(sub.metadata ?? {}) } } },
    });
  }

  event(type: string, object: StripeEvent['data']['object']): StripeEvent {
    return { id: this.id('evt'), type, created: this.now(), livemode: false, data: { object } };
  }

  count(method: string, pathPrefix: string) {
    return this.requests.filter((r) => r.method === method && r.path.startsWith(pathPrefix)).length;
  }
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

/** `metadata[x]` form fields under a prefix, as an object. */
function pick(form: Form, prefix: string): Form {
  const out: Form = {};
  for (const [k, v] of Object.entries(form)) {
    if (k.startsWith(`${prefix}[`) && k.endsWith(']')) out[k.slice(prefix.length + 1, -1)] = v;
  }
  return out;
}

/** The request Stripe would send to the webhook: the raw body and its signature header. */
export function signedDelivery(event: unknown, options: { secret?: string; timestamp?: number; body?: string } = {}) {
  const body = options.body ?? JSON.stringify(event);
  return { rawBody: body, headers: { 'stripe-signature': signStripePayload(body, options.secret ?? TEST_WEBHOOK_SECRET, options.timestamp) } };
}
