import { BILLING_NOT_CONFIGURED_REASON, IDEMPOTENCY_KEY_HEADER, type Subscription } from '@marlinjai/mail-contract';
import { Hono } from 'hono';
import { ApiError } from '../api-error.js';
import { actorOf, type AppEnv } from '../context.js';
import type { Sql } from '../db.js';
import { mount, type MountDeps } from '../mount.js';
import { repos } from '../repo/index.js';
import type { BillingRow } from '../repo/billing.js';
import { checkoutPriceId, LISTED_PLANS, type BillingConfig, type PaidPlanId } from '../billing/plans.js';
import { StripeRequestError, type StripeApi } from '../billing/stripe.js';
import { reconcileWorkspace } from '../billing/sync.js';
import { computeUsage, periodOf } from '../billing/usage.js';
import { body } from '../validate.js';

export type BillingRouteDeps = MountDeps & {
  config: BillingConfig;
  /** Null when no Stripe key is configured: checkout and the portal then fail closed. */
  stripe: StripeApi | null;
  log: Pick<Console, 'error'>;
  /** A mirror older than this is re-read from Stripe when the subscription is read. */
  staleAfterMs?: number;
};

function notConfigured(what: string): never {
  throw new ApiError('service_unavailable', `Billing is not configured on this instance (${what}).`, { reason: BILLING_NOT_CONFIGURED_REASON });
}

/** A Stripe failure, as the API answers it: never Stripe's own message, which may name internals. */
function stripeFailed(err: unknown, log: Pick<Console, 'error'>, what: string): never {
  if (err instanceof StripeRequestError) {
    log.error(`[billing] ${what} failed: Stripe ${err.status} ${err.stripeCode ?? ''} ${err.message}`);
    throw new ApiError('provider_error', `Stripe could not ${what}. Try again in a moment.`, { service: 'stripe', status: err.status });
  }
  throw err;
}

export function toSubscription(row: BillingRow, now: Date = new Date()): Subscription {
  const period = periodOf(row, now);
  return {
    workspace_id: row.workspace_id,
    plan: row.plan,
    status: row.status,
    current_period_start: period.start,
    current_period_end: period.end,
    cancel_at_period_end: row.cancel_at_period_end,
    billing_exempt: row.billing_exempt,
  };
}

/**
 * Billing: the plan catalogue, the workspace's subscription and usage, Stripe
 * Checkout to subscribe and the Stripe customer portal to change or cancel.
 *
 * - Checkout fails closed: without a Stripe key or the plan's Price id it
 *   answers 503 before anything is written or sent to Stripe, so a
 *   misconfigured deploy can never sell a price nobody configured.
 * - A workspace has one Stripe customer, created on its first checkout and
 *   tagged `product=mail`, so the reconciliation can always find its
 *   subscriptions even if every webhook were lost.
 * - A workspace that already pays changes or cancels its plan in the portal
 *   (checkout answers `conflict`): Checkout can only start subscriptions.
 * - An exempt workspace (a design partner) has no checkout and no portal.
 */
export function billingRoutes(sql: Sql, deps: BillingRouteDeps) {
  const app = new Hono<AppEnv>();
  const { pool, config, stripe, log } = deps;
  const staleAfterMs = deps.staleAfterMs ?? 60 * 60_000;

  mount(app, 'billing.plans', deps, async (c) => {
    // Sellable exactly when checkout would go through: the same test as the landing page's.
    return c.json({
      data: LISTED_PLANS.map((plan) => ({
        ...plan,
        sellable: !plan.monthly_price_cents || checkoutPriceId(config, stripe, plan.id as PaidPlanId) !== null,
      })),
    });
  });

  mount(app, 'billing.subscription', deps, async (c) => {
    const { workspaceId } = c.get('access');
    let row = (await pool.billing.get(workspaceId))!;
    const stale = !row.stripe_synced_at || Date.now() - new Date(row.stripe_synced_at).getTime() > staleAfterMs;
    if (stripe && row.stripe_customer_id && !row.billing_exempt && stale) {
      // A missed webhook heals on the next read. Stripe being down must not
      // hide the plan: the mirror is served and the failure logged.
      try {
        await reconcileWorkspace(sql, stripe, config, workspaceId);
        row = (await pool.billing.get(workspaceId))!;
      } catch (err) {
        log.error(`[billing] reconciling ${workspaceId} on read failed:`, err instanceof Error ? err.message : err);
      }
    }
    return c.json(toSubscription(row));
  });

  mount(app, 'billing.usage', deps, async (c) => {
    const { workspaceId } = c.get('access');
    return c.json(await computeUsage(sql, workspaceId));
  });

  mount(app, 'billing.checkout', deps, async (c) => {
    const access = c.get('access');
    const input = await body(c, 'billing.checkout');
    if (!stripe) notConfigured('no Stripe key');
    const priceId = checkoutPriceId(config, stripe, input.plan);
    if (!priceId) notConfigured(`no Stripe Price for the ${input.plan} plan`);

    const row = (await pool.billing.get(access.workspaceId))!;
    if (row.billing_exempt) {
      throw new ApiError('conflict', 'This workspace is a design partner outside billing; there is nothing to buy.', { plan: row.plan });
    }
    if (row.stripe_subscription_id) {
      throw new ApiError('conflict', 'This workspace already has a subscription. Change or cancel the plan in the billing portal.', {
        plan: row.plan,
        use: 'billing.portal',
      });
    }

    let customerId = row.stripe_customer_id;
    if (!customerId) {
      const workspace = await pool.workspaces.get(access.workspaceId);
      try {
        // Keyed per workspace: two first checkouts racing get the same customer.
        const customer = await stripe.createCustomer({
          workspaceId: access.workspaceId,
          name: workspace?.name ?? access.workspaceId,
          idempotencyKey: `mail-customer-${access.workspaceId}`,
        });
        customerId = customer.id;
      } catch (err) {
        stripeFailed(err, log, 'create the billing account');
      }
      customerId = await pool.billing.setCustomer(access.workspaceId, customerId);
    }

    const requestKey = c.req.header(IDEMPOTENCY_KEY_HEADER);
    let session: { id: string; url: string };
    try {
      session = await stripe.createCheckoutSession({
        workspaceId: access.workspaceId,
        customerId,
        priceId,
        plan: input.plan,
        successUrl: input.success_url,
        cancelUrl: input.cancel_url,
        // A retried request (same Idempotency-Key) gets the same session.
        idempotencyKey: `mail-checkout-${access.workspaceId}-${requestKey ?? crypto.randomUUID()}`,
      });
    } catch (err) {
      stripeFailed(err, log, 'start the checkout');
    }
    await repos(sql).audit.record(access.workspaceId, {
      action: 'billing.checkout_started',
      actor: actorOf(access),
      targetType: 'workspace',
      targetId: access.workspaceId,
      details: { plan: input.plan, checkout_session_id: session.id },
    });
    return c.json({ url: session.url });
  });

  mount(app, 'billing.portal', deps, async (c) => {
    const access = c.get('access');
    const input = await body(c, 'billing.portal');
    if (!stripe) notConfigured('no Stripe key');
    const row = (await pool.billing.get(access.workspaceId))!;
    if (row.billing_exempt) {
      throw new ApiError('conflict', 'This workspace is a design partner outside billing; it has no billing portal.');
    }
    if (!row.stripe_customer_id) {
      throw new ApiError('conflict', 'This workspace has no billing account yet. Choose a plan with billing.checkout first.', {
        use: 'billing.checkout',
      });
    }
    try {
      const session = await stripe.createPortalSession({
        customerId: row.stripe_customer_id,
        returnUrl: input.return_url,
        configurationId: config.portalConfigurationId,
      });
      return c.json({ url: session.url });
    } catch (err) {
      stripeFailed(err, log, 'open the billing portal');
    }
  });

  return app;
}
