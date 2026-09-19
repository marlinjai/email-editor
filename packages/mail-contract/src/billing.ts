import { z } from 'zod';
import { Id, Timestamp } from './common';

/*
 * S5, billing: plans, limits and metered usage per workspace, served by the
 * routes in `billingRoutes`. A limit breached returns `plan_limit_reached`
 * (429, not retryable: waiting does not help, a plan change does), with
 * `details.metric` (or `details.feature`), `details.used` and `details.limit`.
 */

export const PLAN_IDS = ['free', 'starter', 'growth', 'design_partner'] as const;
export const PlanId = z.enum(PLAN_IDS);
export type PlanId = z.infer<typeof PlanId>;

/** Null means unlimited. */
export const PlanLimits = z.object({
  monthly_messages: z.number().int().min(0).nullable(),
  contacts: z.number().int().min(0).nullable(),
  members: z.number().int().min(1).nullable(),
  providers: z.number().int().min(1).nullable(),
  webhook_endpoints: z.number().int().min(0).nullable(),
});
export type PlanLimits = z.infer<typeof PlanLimits>;

/** What a plan unlocks beyond its counted limits. */
export const PlanFeatures = z.object({
  /** A/B tests of subject and content on a mailing (S4). */
  ab_testing: z.boolean(),
  /** Open and click tracking, still off until a workspace turns it on (`settings.tracking_enabled`). */
  tracking: z.boolean(),
  /** Sending and hosting pages on the workspace's own domain (a later phase). */
  custom_domains: z.boolean(),
});
export type PlanFeatures = z.infer<typeof PlanFeatures>;
export const PLAN_FEATURES = ['ab_testing', 'tracking', 'custom_domains'] as const satisfies readonly (keyof PlanFeatures)[];
export type PlanFeature = (typeof PLAN_FEATURES)[number];

export const Plan = z.object({
  id: PlanId,
  name: z.string().min(1),
  /** Price in the smallest currency unit per month; null for plans not sold. */
  monthly_price_cents: z.number().int().min(0).nullable(),
  currency: z.string().length(3),
  limits: PlanLimits,
  features: PlanFeatures,
});
export type Plan = z.infer<typeof Plan>;

/**
 * A plan as `billing.plans` lists it. `sellable`: checkout can sell it on this
 * instance right now (Stripe is configured and holds the plan's Price); the free
 * plan is always true. The landing page uses the same signal, so no screen offers
 * a plan that `billing.checkout` would refuse with `billing_not_configured`.
 */
export const CatalogPlan = Plan.extend({ sellable: z.boolean() });
export type CatalogPlan = z.infer<typeof CatalogPlan>;

export const Subscription = z.object({
  workspace_id: Id,
  plan: PlanId,
  status: z.enum(['active', 'trialing', 'past_due', 'cancelled']),
  current_period_start: Timestamp,
  current_period_end: Timestamp,
  cancel_at_period_end: z.boolean(),
  /**
   * A design partner outside billing (plan `design_partner`, no limits, no
   * checkout). Set only by an operator, never through the API.
   */
  billing_exempt: z.boolean(),
});
export type Subscription = z.infer<typeof Subscription>;

export const USAGE_METRICS = ['messages', 'contacts', 'members', 'providers', 'webhook_endpoints'] as const;
export const UsageMetric = z.enum(USAGE_METRICS);
export type UsageMetric = z.infer<typeof UsageMetric>;

/** A metric at or above this share of its limit is reported in `Usage.warnings`. */
export const USAGE_WARNING_RATIO = 0.8;

export const UsageWarning = z.object({
  metric: UsageMetric,
  used: z.number().int().min(0),
  limit: z.number().int().min(0),
  /** `approaching`: at or above USAGE_WARNING_RATIO of the limit; `reached`: at or above the limit. */
  level: z.enum(['approaching', 'reached']),
});
export type UsageWarning = z.infer<typeof UsageWarning>;

/**
 * `messages` counts recipients handed to a provider in the period (tests
 * included), from the service's send ledger. The other metrics are counts now.
 */
export const Usage = z.object({
  plan: PlanId,
  period_start: Timestamp,
  period_end: Timestamp,
  metrics: z.record(UsageMetric, z.object({ used: z.number().int().min(0), limit: z.number().int().min(0).nullable() })),
  warnings: z.array(UsageWarning),
});
export type Usage = z.infer<typeof Usage>;

export const CheckoutRequest = z.object({
  plan: z.enum(['starter', 'growth']),
  success_url: z.string().url(),
  cancel_url: z.string().url(),
});
export type CheckoutRequest = z.infer<typeof CheckoutRequest>;

export const CheckoutSession = z.object({ url: z.string().url() });
export type CheckoutSession = z.infer<typeof CheckoutSession>;

/** The Stripe customer portal: manage the payment method, invoices, switch or cancel the plan. */
export const PortalRequest = z.object({ return_url: z.string().url() });
export type PortalRequest = z.infer<typeof PortalRequest>;

export const PortalSession = z.object({ url: z.string().url() });
export type PortalSession = z.infer<typeof PortalSession>;

/**
 * Sent on every successful `mailings.send` and `mailings.test` whose workspace
 * is at or above USAGE_WARNING_RATIO of a limit: comma-separated
 * `<metric>=<used>/<limit>`, e.g. `messages=8200/10000`.
 */
export const USAGE_WARNING_HEADER = 'x-mail-usage-warning';

/** One `<metric>=<used>/<limit>` entry of the USAGE_WARNING_HEADER. */
export type UsageWarningHeaderEntry = { metric: UsageMetric; used: number; limit: number };

/** Builds the USAGE_WARNING_HEADER value from a usage's warnings, or null when there are none. */
export function formatUsageWarningHeader(warnings: ReadonlyArray<Pick<UsageWarning, 'metric' | 'used' | 'limit'>>): string | null {
  if (warnings.length === 0) return null;
  return warnings.map((w) => `${w.metric}=${w.used}/${w.limit}`).join(',');
}

/**
 * Reads a USAGE_WARNING_HEADER value back. Entries that do not parse (an
 * unknown metric, a malformed count) are skipped rather than failing the
 * whole response: the header is advisory, the call itself succeeded.
 */
export function parseUsageWarningHeader(value: string | null | undefined): UsageWarningHeaderEntry[] {
  if (!value) return [];
  const out: UsageWarningHeaderEntry[] = [];
  for (const part of value.split(',')) {
    const match = /^\s*([a-z_]+)=(\d+)\/(\d+)\s*$/.exec(part);
    if (!match) continue;
    const metric = UsageMetric.safeParse(match[1]);
    if (!metric.success) continue;
    out.push({ metric: metric.data, used: Number(match[2]), limit: Number(match[3]) });
  }
  return out;
}
