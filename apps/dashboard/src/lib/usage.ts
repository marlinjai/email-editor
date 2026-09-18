import { USAGE_WARNING_RATIO, type Plan, type PlanId, type UsageMetric } from '@marlinjai/mail-sdk';
import { formatCount } from './format';

/**
 * Plan limits and usage in words, shared by the Billing screen, the workspace
 * banner and the notice after a send or test. Pure, safe on either side.
 */

export const METRIC_LABELS: Record<UsageMetric, { name: string; unit: string; one: string; period: boolean }> = {
  messages: { name: 'Messages', unit: 'messages', one: 'message', period: true },
  contacts: { name: 'Contacts', unit: 'contacts', one: 'contact', period: false },
  members: { name: 'Members', unit: 'members', one: 'member', period: false },
  providers: { name: 'Providers', unit: 'providers', one: 'provider', period: false },
  webhook_endpoints: { name: 'Webhook endpoints', unit: 'webhook endpoints', one: 'webhook endpoint', period: false },
};

/**
 * Every plan's name, for a plan the catalogue does not list: `billing.plans`
 * returns what can be bought, never the design partners' exemption.
 */
export const PLAN_NAMES: Record<PlanId, string> = { free: 'Free', starter: 'Starter', growth: 'Growth', design_partner: 'Design partner' };

export type UsageLevel = 'ok' | 'approaching' | 'reached';

/** Where a count stands against its limit, with the contract's 80 percent threshold. Unlimited is always ok. */
export function usageLevel(used: number, limit: number | null): UsageLevel {
  if (limit === null) return 'ok';
  if (used >= limit) return 'reached';
  if (used >= limit * USAGE_WARNING_RATIO) return 'approaching';
  return 'ok';
}

/** "8,200 of 10,000 messages this period", "500 of 500 contacts". */
export function usageSentence(entry: { metric: UsageMetric; used: number; limit: number }): string {
  const label = METRIC_LABELS[entry.metric];
  return `${formatCount(entry.used)} of ${formatCount(entry.limit)} ${label.unit}${label.period ? ' this period' : ''}`;
}

/**
 * The metrics that grow by themselves (sending, sign-ups, imports) and so
 * deserve a warning wherever the person is. Members, providers and webhook
 * endpoints only change when an admin adds one, and a Free workspace sits at
 * "1 of 1 providers" from its first provider on: the Billing screen shows
 * them, a banner would only be noise.
 */
const WARN_ANYWHERE: ReadonlySet<UsageMetric> = new Set(['messages', 'contacts']);

/**
 * One sentence for a set of warnings (the usage's `warnings` or the parsed
 * `x-mail-usage-warning` header), naming the worst level. Null when there is
 * nothing worth interrupting for.
 */
export function usageWarningSummary(all: Array<{ metric: UsageMetric; used: number; limit: number }>): { level: Exclude<UsageLevel, 'ok'>; text: string } | null {
  const entries = all.filter((e) => WARN_ANYWHERE.has(e.metric));
  if (entries.length === 0) return null;
  const reached = entries.some((e) => usageLevel(e.used, e.limit) === 'reached');
  const list = entries.map(usageSentence).join(', ');
  return reached
    ? { level: 'reached', text: `This workspace has reached a limit of its plan: ${list}. Upgrade the plan to keep going.` }
    : { level: 'approaching', text: `This workspace is close to the limits of its plan: ${list}.` };
}

/** "9 EUR a month", "Free", or null for a plan that is not sold. */
export function formatPrice(plan: Pick<Plan, 'monthly_price_cents' | 'currency'>): string | null {
  if (plan.monthly_price_cents === null) return null;
  if (plan.monthly_price_cents === 0) return 'Free';
  const whole = plan.monthly_price_cents % 100 === 0;
  const amount = new Intl.NumberFormat('en-GB', { style: 'currency', currency: plan.currency, minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 }).format(
    plan.monthly_price_cents / 100,
  );
  return `${amount} a month`;
}

export const billingPath = (ws: string) => `/w/${ws}/settings/billing`;
