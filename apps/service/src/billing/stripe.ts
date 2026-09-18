import { createHmac } from 'node:crypto';
import { timingSafeEqual } from '../api-key.js';
import { STRIPE_API_VERSION, STRIPE_PRODUCT_TAG } from './plans.js';

/*
 * Stripe over plain HTTPS, no SDK: the same shape as Lumitra QR
 * (functions/api/billing/*.ts), with the fetch injectable so tests drive a fake.
 */

export const STRIPE_API = 'https://api.stripe.com/v1';

type Metadata = Record<string, string | undefined> | null | undefined;

/** The slice of a Stripe subscription this service reads. */
export type StripeSubscription = {
  id: string;
  customer: string;
  status: 'incomplete' | 'incomplete_expired' | 'trialing' | 'active' | 'past_due' | 'canceled' | 'unpaid' | 'paused';
  cancel_at_period_end: boolean;
  metadata?: Metadata;
  /** Before API version 2025-03-31 the period sat on the subscription. */
  current_period_start?: number;
  current_period_end?: number;
  items: {
    data: Array<{
      price: { id: string };
      /** From 2025-03-31 (basil) on the period sits on each item. */
      current_period_start?: number;
      current_period_end?: number;
    }>;
  };
  created: number;
};

/** A Stripe error: `status` 0 means Stripe was not reached (network, timeout). */
export class StripeRequestError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly stripeCode?: string,
  ) {
    super(message);
    this.name = 'StripeRequestError';
  }
}

export type CheckoutInput = {
  workspaceId: string;
  customerId: string;
  priceId: string;
  plan: string;
  successUrl: string;
  cancelUrl: string;
  idempotencyKey: string;
};

export interface StripeApi {
  createCustomer(input: { workspaceId: string; name: string; idempotencyKey: string }): Promise<{ id: string }>;
  createCheckoutSession(input: CheckoutInput): Promise<{ id: string; url: string }>;
  createPortalSession(input: { customerId: string; returnUrl: string; configurationId?: string }): Promise<{ url: string }>;
  getSubscription(id: string): Promise<StripeSubscription | null>;
  /** Every subscription of a customer, any status, newest first. */
  listSubscriptions(customerId: string): Promise<StripeSubscription[]>;
}

/** Stripe's form encoding: nested keys as `a[b][c]`. */
export function formEncode(params: Record<string, string | undefined>): URLSearchParams {
  const out = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined) out.set(k, v);
  return out;
}

export function createStripeApi(
  secretKey: string,
  options: { fetch?: typeof fetch; timeoutMs?: number; /** stripe-mock in tests; Stripe itself otherwise. */ baseUrl?: string } = {},
): StripeApi {
  const doFetch = options.fetch ?? fetch;
  const base = options.baseUrl ?? STRIPE_API;
  const timeoutMs = options.timeoutMs ?? 10_000;
  const auth = `Basic ${Buffer.from(`${secretKey}:`).toString('base64')}`;

  async function request<T>(method: 'GET' | 'POST', path: string, form?: URLSearchParams, idempotencyKey?: string): Promise<T> {
    const headers: Record<string, string> = { authorization: auth, 'stripe-version': STRIPE_API_VERSION };
    if (form) headers['content-type'] = 'application/x-www-form-urlencoded';
    if (idempotencyKey) headers['idempotency-key'] = idempotencyKey;
    let res: Response;
    try {
      res = await doFetch(`${base}${path}`, { method, headers, body: form?.toString(), signal: AbortSignal.timeout(timeoutMs) });
    } catch (err) {
      throw new StripeRequestError(0, `Stripe was not reached: ${err instanceof Error ? err.message : String(err)}`);
    }
    const text = await res.text();
    let json: any;
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      throw new StripeRequestError(res.status, `Stripe answered ${res.status} with a body that is not JSON`);
    }
    if (!res.ok) {
      throw new StripeRequestError(res.status, json?.error?.message ?? `Stripe answered ${res.status}`, json?.error?.code);
    }
    return json as T;
  }

  return {
    async createCustomer({ workspaceId, name, idempotencyKey }) {
      return request<{ id: string }>(
        'POST',
        '/customers',
        formEncode({ name, 'metadata[product]': STRIPE_PRODUCT_TAG, 'metadata[workspace_id]': workspaceId }),
        idempotencyKey,
      );
    },

    async createCheckoutSession(input) {
      const session = await request<{ id: string; url: string | null }>(
        'POST',
        '/checkout/sessions',
        formEncode({
          mode: 'subscription',
          customer: input.customerId,
          client_reference_id: input.workspaceId,
          success_url: input.successUrl,
          cancel_url: input.cancelUrl,
          // Name, description and amount all come from the catalogue Price.
          'line_items[0][price]': input.priceId,
          'line_items[0][quantity]': '1',
          // The tag and the workspace travel on the session, and via
          // subscription_data on the subscription, so every later
          // customer.subscription.* and invoice.* event carries them too.
          'metadata[product]': STRIPE_PRODUCT_TAG,
          'metadata[workspace_id]': input.workspaceId,
          'metadata[plan]': input.plan,
          'subscription_data[metadata][product]': STRIPE_PRODUCT_TAG,
          'subscription_data[metadata][workspace_id]': input.workspaceId,
          'subscription_data[metadata][plan]': input.plan,
        }),
        input.idempotencyKey,
      );
      if (!session.url) throw new StripeRequestError(502, 'Stripe created a Checkout Session without a URL');
      return { id: session.id, url: session.url };
    },

    async createPortalSession({ customerId, returnUrl, configurationId }) {
      return request<{ url: string }>(
        'POST',
        '/billing_portal/sessions',
        formEncode({ customer: customerId, return_url: returnUrl, configuration: configurationId }),
      );
    },

    async getSubscription(id) {
      try {
        return await request<StripeSubscription>('GET', `/subscriptions/${encodeURIComponent(id)}`);
      } catch (err) {
        if (err instanceof StripeRequestError && err.status === 404) return null;
        throw err;
      }
    },

    async listSubscriptions(customerId) {
      const q = new URLSearchParams({ customer: customerId, status: 'all', limit: '100' });
      const page = await request<{ data: StripeSubscription[] }>('GET', `/subscriptions?${q}`);
      return [...page.data].sort((a, b) => b.created - a.created);
    },
  };
}

/** The period of a subscription, wherever the pinned API version puts it. */
export function subscriptionPeriod(sub: StripeSubscription): { start: string; end: string } | null {
  const item = sub.items.data[0];
  const start = item?.current_period_start ?? sub.current_period_start;
  const end = item?.current_period_end ?? sub.current_period_end;
  if (start === undefined || end === undefined || end <= start) return null;
  return { start: new Date(start * 1000).toISOString(), end: new Date(end * 1000).toISOString() };
}

/** Seconds a signed webhook may be old (and early), Stripe's own default. */
export const STRIPE_SIGNATURE_TOLERANCE_SECONDS = 300;

/**
 * Verifies `Stripe-Signature` (`t=<unix>,v1=<hex>[,v1=<hex>]`) over
 * `${t}.${rawBody}` with HMAC-SHA256 and the endpoint's `whsec_` secret, in
 * constant time, within the tolerance. The raw body exactly as received: a
 * re-serialised JSON would not match.
 */
export function verifyStripeSignature(
  rawBody: string,
  header: string | undefined,
  secret: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): boolean {
  if (!header) return false;
  let timestamp: string | null = null;
  const signatures: string[] = [];
  for (const part of header.split(',')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    const key = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (key === 't') timestamp = value;
    else if (key === 'v1') signatures.push(value);
  }
  if (!timestamp || !/^\d{1,12}$/.test(timestamp) || signatures.length === 0) return false;
  if (Math.abs(nowSeconds - Number(timestamp)) > STRIPE_SIGNATURE_TOLERANCE_SECONDS) return false;
  const expected = createHmac('sha256', secret).update(`${timestamp}.${rawBody}`, 'utf8').digest('hex');
  return signatures.some((sig) => timingSafeEqual(sig.toLowerCase(), expected));
}

/** Signs a payload the way Stripe does; for tests and the local webhook fixtures. */
export function signStripePayload(rawBody: string, secret: string, timestamp: number = Math.floor(Date.now() / 1000)): string {
  const sig = createHmac('sha256', secret).update(`${timestamp}.${rawBody}`, 'utf8').digest('hex');
  return `t=${timestamp},v1=${sig}`;
}

/** The slice of a Stripe event the product gate and the handlers read. */
export type StripeEvent = {
  id: string;
  type: string;
  created: number;
  livemode?: boolean;
  data: {
    object: {
      id?: string;
      object?: string;
      customer?: string | null;
      subscription?: string | null;
      client_reference_id?: string | null;
      metadata?: Metadata;
      subscription_details?: { metadata?: Metadata } | null;
      parent?: { subscription_details?: { metadata?: Metadata; subscription?: string | null } | null } | null;
    };
  };
};

/**
 * The product tag of an event, where each family carries it (the same reader
 * as Lumitra QR's `readProductTag`): checkout sessions, subscriptions and
 * customers on their own metadata; invoices on the subscription's metadata,
 * at `subscription_details` before API 2025-03-31 and under `parent` from then on.
 * Null when absent.
 */
export function readProductTag(event: StripeEvent): string | null {
  const o = event.data?.object;
  if (!o) return null;
  const tag = event.type.startsWith('invoice.')
    ? (o.subscription_details?.metadata?.product ?? o.parent?.subscription_details?.metadata?.product)
    : o.metadata?.product;
  return typeof tag === 'string' && tag.length > 0 ? tag : null;
}

/** The workspace id an event names in its metadata, if any. */
export function readWorkspaceId(event: StripeEvent): string | null {
  const o = event.data.object;
  const id = event.type.startsWith('invoice.')
    ? (o.subscription_details?.metadata?.workspace_id ?? o.parent?.subscription_details?.metadata?.workspace_id)
    : (o.metadata?.workspace_id ?? o.client_reference_id);
  return typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) ? id.toLowerCase() : null;
}

/** The subscription an event is about, if it names one. */
export function readSubscriptionId(event: StripeEvent): string | null {
  const o = event.data.object;
  if (event.type.startsWith('customer.subscription.')) return o.id ?? null;
  if (event.type.startsWith('invoice.')) return o.subscription ?? o.parent?.subscription_details?.subscription ?? null;
  if (event.type.startsWith('checkout.session.')) return o.subscription ?? null;
  return null;
}
