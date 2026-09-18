import type { Plan, PlanFeature, PlanId, PlanLimits, UsageMetric } from '@marlinjai/mail-contract';
import type { StripeApi } from './stripe.js';

/**
 * The plan catalogue. Limits and features are the service's own (what it
 * enforces); what a paid plan costs is the Stripe Price it is sold with, whose
 * id comes from configuration (`BillingConfig.prices`), never from code.
 * `monthly_price_cents` mirrors the Price for display only: Stripe charges
 * what its Price says, so a change there must be mirrored here (as in
 * Lumitra QR's PLAN_PRICES_CENTS). Defaults taken on 2026-09-18, recorded in
 * the plan's S5 section.
 */
export const PLANS: Readonly<Record<PlanId, Plan>> = {
  free: {
    id: 'free',
    name: 'Free',
    monthly_price_cents: 0,
    currency: 'EUR',
    limits: { monthly_messages: 1_000, contacts: 500, members: 2, providers: 1, webhook_endpoints: 1 },
    features: { ab_testing: false, tracking: false, custom_domains: false },
  },
  starter: {
    id: 'starter',
    name: 'Starter',
    monthly_price_cents: 900,
    currency: 'EUR',
    limits: { monthly_messages: 10_000, contacts: 5_000, members: 5, providers: 2, webhook_endpoints: 3 },
    features: { ab_testing: false, tracking: true, custom_domains: false },
  },
  growth: {
    id: 'growth',
    name: 'Growth',
    monthly_price_cents: 2_900,
    currency: 'EUR',
    limits: { monthly_messages: 50_000, contacts: 25_000, members: 20, providers: 5, webhook_endpoints: 10 },
    features: { ab_testing: true, tracking: true, custom_domains: false },
  },
  // Not sold: the operator's exemption for design partners (ŌPUNTIA), no limits.
  design_partner: {
    id: 'design_partner',
    name: 'Design partner',
    monthly_price_cents: null,
    currency: 'EUR',
    limits: { monthly_messages: null, contacts: null, members: null, providers: null, webhook_endpoints: null },
    features: { ab_testing: true, tracking: true, custom_domains: true },
  },
};

export type PaidPlanId = 'starter' | 'growth';
export const PAID_PLANS: readonly PaidPlanId[] = ['starter', 'growth'];

/** The plans offered to the public, in order: `billing.plans` and the landing page list exactly these. */
export const LISTED_PLANS: readonly Plan[] = [PLANS.free, ...PAID_PLANS.map((p) => PLANS[p])];

/** The limit of a usage metric in a plan's limits (null is unlimited). */
export function limitOf(limits: PlanLimits, metric: UsageMetric): number | null {
  switch (metric) {
    case 'messages':
      return limits.monthly_messages;
    default:
      return limits[metric];
  }
}

export function hasFeature(plan: PlanId, feature: PlanFeature): boolean {
  return PLANS[plan].features[feature];
}

/**
 * The product tag on the shared Lumitra Stripe account. Every Checkout Session,
 * subscription and customer this service creates carries `metadata.product`
 * with it, and the webhook drops events tagged for another product (the tag
 * table: knowledge-base/plans/2026-09-06-stripe-single-account-webhook-isolation.md).
 * A constant per repository, never a runtime setting.
 */
export const STRIPE_PRODUCT_TAG = 'mail';

/** The Stripe API version every request pins and the webhook endpoint is registered with. */
export const STRIPE_API_VERSION = '2025-03-31.basil';

/**
 * Stripe settings from the environment. Every field is optional: billing
 * without Stripe still serves plans, usage and enforcement (they are
 * database-derived), while checkout, the portal and the webhook fail closed.
 */
export type BillingConfig = {
  secretKey?: string;
  webhookSecret?: string;
  /** The Stripe Price id each paid plan is sold with. */
  prices: Partial<Record<PaidPlanId, string>>;
  /** A customer-portal configuration allowing switches between the plans' Prices; Stripe's default when unset. */
  portalConfigurationId?: string;
};

/**
 * The Stripe Price a paid plan is sold with on this instance, or null when it
 * cannot be sold: no Stripe client (no key) or no Price id configured for it.
 * Checkout fails closed on null, and the public landing page shows the plan as
 * "coming soon" on the same answer, so the two can never disagree.
 */
export function checkoutPriceId(config: BillingConfig, stripe: StripeApi | null, plan: PaidPlanId): string | null {
  if (!stripe) return null;
  return config.prices[plan] ?? null;
}

/** The paid plan a Stripe Price id sells, or null for a Price this service does not know. */
export function planForPrice(config: BillingConfig, priceId: string): PaidPlanId | null {
  for (const plan of PAID_PLANS) if (config.prices[plan] === priceId) return plan;
  return null;
}
