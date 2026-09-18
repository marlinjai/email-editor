import type { AuditActor } from '@marlinjai/mail-contract';
import type { Db, Sql } from '../db.js';
import { repos } from '../repo/index.js';
import type { BillingMirror, BillingRow } from '../repo/billing.js';
import { planForPrice, STRIPE_PRODUCT_TAG, type BillingConfig } from './plans.js';
import { subscriptionPeriod, type StripeApi, type StripeSubscription } from './stripe.js';

/**
 * Mirroring a Stripe subscription onto the workspace. Every path (the webhook,
 * the reconciliation loop, a stale read of `billing.subscription`) re-reads the
 * subscription from Stripe and writes what it says now, so events arriving out
 * of order, twice, or not at all all converge on Stripe's current state.
 */

/** A subscription on a Price this service does not sell: a configuration error, never guessed around. */
export class UnknownPriceError extends Error {
  constructor(
    readonly subscriptionId: string,
    readonly priceId: string | null,
  ) {
    super(`subscription ${subscriptionId} is on price ${priceId ?? '(none)'}, which no plan is configured with`);
    this.name = 'UnknownPriceError';
  }
}

/** A subscription whose metadata names another workspace than the one it was found for. */
export class ForeignSubscriptionError extends Error {
  constructor(subscriptionId: string) {
    super(`subscription ${subscriptionId} belongs to another workspace`);
    this.name = 'ForeignSubscriptionError';
  }
}

const LIVE_STATUSES = new Set<StripeSubscription['status']>(['active', 'trialing', 'past_due', 'unpaid', 'paused']);

/**
 * What a subscription means for the workspace, or null when it changes nothing
 * yet (`incomplete`: the first payment is still pending, the previous state
 * stands).
 *
 * - `active`, `trialing`: the plan of its Price.
 * - `past_due`, `unpaid`: the plan stays while Stripe retries the payment
 *   (dunning); Stripe cancels the subscription when it gives up.
 * - `paused` (a trial ended without a payment method): back to free, `past_due`.
 * - `canceled`, `incomplete_expired`: back to free, `cancelled`.
 */
export function mirrorOf(config: BillingConfig, sub: StripeSubscription): BillingMirror | null {
  if (sub.status === 'incomplete') return null;
  const priceId = sub.items.data[0]?.price.id ?? null;
  const period = subscriptionPeriod(sub);
  const ended = sub.status === 'canceled' || sub.status === 'incomplete_expired';
  if (ended || sub.status === 'paused') {
    return {
      plan: 'free',
      status: ended ? 'cancelled' : 'past_due',
      stripeSubscriptionId: null,
      stripePriceId: null,
      currentPeriodStart: null,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
    };
  }
  const plan = priceId ? planForPrice(config, priceId) : null;
  if (!plan) throw new UnknownPriceError(sub.id, priceId);
  return {
    plan,
    status: sub.status === 'active' ? 'active' : sub.status === 'trialing' ? 'trialing' : 'past_due',
    stripeSubscriptionId: sub.id,
    stripePriceId: priceId,
    currentPeriodStart: period?.start ?? null,
    currentPeriodEnd: period?.end ?? null,
    cancelAtPeriodEnd: sub.cancel_at_period_end,
  };
}

/** Whether a subscription is this workspace's own: tagged for this product and naming no other workspace. */
export function belongsTo(sub: StripeSubscription, workspaceId: string): boolean {
  const tag = sub.metadata?.product;
  if (tag !== undefined && tag !== STRIPE_PRODUCT_TAG) return false;
  const ws = sub.metadata?.workspace_id;
  return ws === undefined || ws.toLowerCase() === workspaceId;
}

/**
 * Writes the mirror and, when it changed anything, the audit row, inside the
 * caller's transaction. Returns whether it changed.
 */
export async function applyMirror(tx: Db, workspaceId: string, mirror: BillingMirror, actor: AuditActor): Promise<boolean> {
  const r = repos(tx);
  const before = await r.billing.lock(workspaceId);
  if (!before) return false;
  const { changed, row } = await r.billing.mirror(workspaceId, mirror);
  if (changed && row) {
    await r.audit.record(workspaceId, {
      action: 'billing.subscription_changed',
      actor,
      targetType: 'workspace',
      targetId: workspaceId,
      details: {
        from: { plan: before.plan, status: before.status },
        to: { plan: row.plan, status: row.status },
        stripe_subscription_id: mirror.stripeSubscriptionId ?? before.stripe_subscription_id,
        cancel_at_period_end: row.cancel_at_period_end,
      },
    });
  }
  return changed;
}

/**
 * The subscription that decides a workspace's plan, read from Stripe: the one
 * the mirror names, else the newest live one of the workspace's customer, else
 * the newest ended one. Null when the customer never subscribed.
 */
export async function readCurrentSubscription(stripe: StripeApi, billing: BillingRow): Promise<StripeSubscription | null> {
  const ws = billing.workspace_id;
  if (billing.stripe_subscription_id) {
    const sub = await stripe.getSubscription(billing.stripe_subscription_id);
    if (sub && !belongsTo(sub, ws)) throw new ForeignSubscriptionError(sub.id);
    // A subscription that ended may have been replaced: look at the customer's list.
    if (sub && LIVE_STATUSES.has(sub.status)) return sub;
  }
  if (!billing.stripe_customer_id) return null;
  const all = (await stripe.listSubscriptions(billing.stripe_customer_id)).filter((s) => belongsTo(s, ws));
  return all.find((s) => LIVE_STATUSES.has(s.status) || s.status === 'incomplete') ?? all[0] ?? null;
}

/**
 * Re-reads one workspace's subscription from Stripe and mirrors it. Returns
 * whether the mirror changed. Throws Stripe and configuration errors to the
 * caller, which decides whether to log or answer with them.
 */
export async function reconcileWorkspace(sql: Sql, stripe: StripeApi, config: BillingConfig, workspaceId: string): Promise<boolean> {
  const billing = await repos(sql).billing.get(workspaceId);
  if (!billing?.stripe_customer_id) return false;
  const sub = await readCurrentSubscription(stripe, billing);
  if (!sub) {
    await repos(sql).billing.markSynced(workspaceId);
    return false;
  }
  const mirror = mirrorOf(config, sub);
  return (await sql.begin(async (tx) => {
    if (!mirror) {
      await repos(tx).billing.markSynced(workspaceId);
      return false;
    }
    return applyMirror(tx, workspaceId, mirror, { type: 'system', reason: 'stripe reconciliation' });
  })) as boolean;
}

export type ReconcileLoop = { stop(): Promise<void>; runOnce(): Promise<number> };

/**
 * Reconciliation: every `everyMs`, re-reads the subscription of each
 * workspace whose mirror is older than `staleAfterMs`, so a webhook Stripe
 * never delivered (or one that failed for good) still converges. Runs once at
 * start. Errors are logged per workspace and never stop the loop.
 */
export function startReconcileLoop(
  sql: Sql,
  stripe: StripeApi,
  config: BillingConfig,
  options: { everyMs?: number; staleAfterMs?: number; batch?: number; log?: Pick<Console, 'error' | 'log'> } = {},
): ReconcileLoop {
  const everyMs = options.everyMs ?? 15 * 60_000;
  const staleAfterMs = options.staleAfterMs ?? 60 * 60_000;
  const batch = options.batch ?? 50;
  const log = options.log ?? console;
  let stopped = false;
  let running: Promise<number> | null = null;

  async function runOnce(): Promise<number> {
    const stale = await repos(sql).billing.listStaleForWorker(new Date(Date.now() - staleAfterMs), batch);
    let changed = 0;
    for (const { workspace_id } of stale) {
      if (stopped) break;
      try {
        if (await reconcileWorkspace(sql, stripe, config, workspace_id)) changed++;
      } catch (err) {
        log.error(`[billing] reconciling workspace ${workspace_id} failed:`, err instanceof Error ? err.message : err);
      }
    }
    if (changed > 0) log.log(`[billing] reconciliation changed ${changed} workspaces`);
    return changed;
  }

  const tick = () => {
    if (stopped || running) return;
    running = runOnce()
      .catch((err) => {
        log.error('[billing] reconciliation failed:', err);
        return 0;
      })
      .finally(() => {
        running = null;
      });
  };
  const timer = setInterval(tick, everyMs);
  timer.unref();
  tick();

  return {
    runOnce,
    async stop() {
      stopped = true;
      clearInterval(timer);
      await running;
    },
  };
}
