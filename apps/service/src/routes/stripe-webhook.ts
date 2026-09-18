import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import type { AppEnv } from '../context.js';
import type { Sql } from '../db.js';
import { repos } from '../repo/index.js';
import { STRIPE_PRODUCT_TAG, type BillingConfig } from '../billing/plans.js';
import {
  readProductTag,
  readSubscriptionId,
  readWorkspaceId,
  StripeRequestError,
  verifyStripeSignature,
  type StripeApi,
  type StripeEvent,
} from '../billing/stripe.js';
import { applyMirror, ForeignSubscriptionError, mirrorOf, readCurrentSubscription, UnknownPriceError } from '../billing/sync.js';

/** Where Stripe posts events; outside /v1 and the contract, like the unsubscribe page. */
export const STRIPE_WEBHOOK_PATH = '/stripe/webhook';

/** The events the endpoint is registered for (scripts/stripe-setup.mjs registers exactly these; a unit test holds the lists equal). */
export const STRIPE_WEBHOOK_EVENTS = [
  'checkout.session.completed',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'invoice.paid',
  'invoice.payment_failed',
] as const;

const HANDLED = new Set<string>(STRIPE_WEBHOOK_EVENTS);

/** Stripe events are small; anything larger is not one. */
const MAX_EVENT_BYTES = 512 * 1024;

export type StripeWebhookDeps = {
  config: BillingConfig;
  stripe: StripeApi | null;
  log: Pick<Console, 'error' | 'log'>;
};

/**
 * The Stripe webhook, Lumitra QR's pattern on this service:
 *
 * 1. Fail closed: without a webhook secret (or a Stripe key to re-read the
 *    subscription with) it answers 503, never 200, so Stripe keeps the event
 *    and retries once the deploy is configured.
 * 2. The signature (`Stripe-Signature`) is checked over the raw body exactly as
 *    received, before anything parses it: 400 when it does not match.
 * 3. The product gate: the Stripe account is shared by every Lumitra product
 *    and Stripe sends every endpoint every event of a subscribed type. An event
 *    tagged for another product is acknowledged (200) and dropped, logging only
 *    its type and id (its metadata is another product's customer data). An
 *    untagged one is ours only if its customer or subscription is one this
 *    service recorded.
 * 4. Exactly once: the event id is claimed in `stripe_events` in the same
 *    transaction as the change it causes. A replay finds its row and changes
 *    nothing; a failure rolls both back and Stripe's retry runs it again.
 * 5. The change itself re-reads the subscription from Stripe and mirrors its
 *    current state (src/billing/sync.ts), so events out of order converge.
 *
 * A processing failure answers 500, so Stripe retries on its schedule.
 */
export function stripeWebhookRoutes(sql: Sql, deps: StripeWebhookDeps) {
  const app = new Hono<AppEnv>();
  const { config, stripe, log } = deps;

  const tooLarge = bodyLimit({ maxSize: MAX_EVENT_BYTES, onError: (c) => c.json({ error: 'payload too large' }, 413) });

  app.post(STRIPE_WEBHOOK_PATH, tooLarge, async (c) => {
    if (!config.webhookSecret || !stripe) {
      log.error('[billing] a Stripe webhook arrived, but STRIPE_WEBHOOK_SECRET or STRIPE_SECRET_KEY is not configured');
      return c.json({ error: 'billing is not configured' }, 503);
    }
    const raw = await c.req.text();
    if (!verifyStripeSignature(raw, c.req.header('stripe-signature'), config.webhookSecret)) {
      return c.json({ error: 'invalid signature' }, 400);
    }
    let event: StripeEvent;
    try {
      event = JSON.parse(raw) as StripeEvent;
    } catch {
      return c.json({ error: 'invalid JSON' }, 400);
    }
    if (typeof event?.id !== 'string' || !/^evt_[A-Za-z0-9]+$/.test(event.id) || typeof event.type !== 'string' || !event.data?.object) {
      return c.json({ error: 'not a Stripe event' }, 400);
    }

    const tag = readProductTag(event);
    if (tag !== null && tag !== STRIPE_PRODUCT_TAG) {
      log.log(`[billing] ignoring ${event.type} ${event.id} for product ${tag}`);
      return c.json({ received: true, ignored: 'other_product' });
    }
    if (!HANDLED.has(event.type)) return c.json({ received: true, ignored: 'event_type' });
    if (await repos(sql).stripeEvents.exists(event.id)) return c.json({ received: true, replay: true });

    // Which workspace: the one the ids this service recorded point to. The
    // metadata's workspace id is only believed when it agrees with them, so an
    // event can never move another workspace's plan.
    const o = event.data.object;
    const subscriptionId = readSubscriptionId(event);
    const customerId = typeof o.customer === 'string' ? o.customer : null;
    const byIds = await repos(sql).billing.workspaceForStripeForWebhook({ customerId, subscriptionId });
    const claimed = readWorkspaceId(event);
    if (claimed && byIds && claimed !== byIds) {
      log.error(`[billing] ${event.type} ${event.id} names workspace ${claimed} but its customer belongs to ${byIds}; not applied`);
    }
    const workspaceId = byIds && (!claimed || claimed === byIds) ? byIds : null;

    if (!workspaceId) {
      if (tag === null) return c.json({ received: true, ignored: 'not_ours' });
      await sql.begin(async (tx) => {
        const r = repos(tx);
        if (await r.stripeEvents.claim(event)) await r.stripeEvents.settle(event.id, null, 'unknown_workspace');
      });
      log.error(`[billing] ${event.type} ${event.id} is tagged for this service but matches no workspace`);
      return c.json({ received: true, ignored: 'unknown_workspace' });
    }

    if (event.type === 'invoice.payment_failed') {
      log.error(`[billing] a payment failed for workspace ${workspaceId} (${event.id}); Stripe retries it`);
    }

    // Read Stripe's current state before the transaction: no network call
    // holds a database lock.
    let mirror: ReturnType<typeof mirrorOf> = null;
    try {
      // The subscription that decides the plan now: the recorded one if it is
      // still live, else the event's, else the customer's newest live one. So
      // the late `deleted` of a replaced subscription never ends its successor.
      const billing = (await repos(sql).billing.get(workspaceId))!;
      const sub = await readCurrentSubscription(stripe, {
        ...billing,
        stripe_subscription_id: billing.stripe_subscription_id ?? subscriptionId,
      });
      mirror = sub ? mirrorOf(config, sub) : null;
    } catch (err) {
      if (err instanceof StripeRequestError || err instanceof UnknownPriceError || err instanceof ForeignSubscriptionError) {
        log.error(`[billing] ${event.type} ${event.id} for workspace ${workspaceId} not applied: ${err.message}`);
        return c.json({ error: 'processing failed' }, 500);
      }
      throw err;
    }

    const outcome = await sql.begin(async (tx) => {
      const r = repos(tx);
      if (!(await r.stripeEvents.claim(event))) return 'replay' as const;
      const changed = mirror
        ? await applyMirror(tx, workspaceId, mirror, { type: 'system', reason: `stripe ${event.type} ${event.id}` })
        : (await r.billing.markSynced(workspaceId), false);
      await r.stripeEvents.settle(event.id, workspaceId, changed ? 'applied' : 'unchanged');
      return changed ? ('applied' as const) : ('unchanged' as const);
    });
    return c.json({ received: true, outcome });
  });

  return app;
}
