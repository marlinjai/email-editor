import { z } from 'zod';
import { Id, Timestamp } from './common';

/*
 * S5, billing: plans, limits and metered usage per workspace. Typed now so S5
 * extends these shapes; the routes are listed in `billingRoutes` and are not
 * served before S5 ships. A limit breached returns `plan_limit_reached` (429).
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

export const Plan = z.object({
  id: PlanId,
  name: z.string().min(1),
  /** Price in the smallest currency unit per month; null for plans not sold. */
  monthly_price_cents: z.number().int().min(0).nullable(),
  currency: z.string().length(3),
  limits: PlanLimits,
});
export type Plan = z.infer<typeof Plan>;

export const Subscription = z.object({
  workspace_id: Id,
  plan: PlanId,
  status: z.enum(['active', 'trialing', 'past_due', 'cancelled']),
  current_period_start: Timestamp,
  current_period_end: Timestamp,
  cancel_at_period_end: z.boolean(),
});
export type Subscription = z.infer<typeof Subscription>;

export const USAGE_METRICS = ['messages', 'contacts', 'members', 'providers', 'webhook_endpoints'] as const;
export const UsageMetric = z.enum(USAGE_METRICS);
export type UsageMetric = z.infer<typeof UsageMetric>;

export const Usage = z.object({
  period_start: Timestamp,
  period_end: Timestamp,
  metrics: z.record(UsageMetric, z.object({ used: z.number().int().min(0), limit: z.number().int().min(0).nullable() })),
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
