import {
  USAGE_METRICS,
  USAGE_WARNING_RATIO,
  type PlanFeature,
  type Usage,
  type UsageMetric,
  type UsageWarning,
} from '@marlinjai/mail-contract';
import { ApiError } from '../api-error.js';
import type { Db } from '../db.js';
import { repos } from '../repo/index.js';
import type { BillingRow } from '../repo/billing.js';
import { limitOf, PLANS } from './plans.js';

/**
 * Metering and enforcement. Usage is computed from the service's own rows on
 * every read, never stored, so it cannot drift: `messages` is the sum of the
 * send ledger (`provider_sends`, every recipient handed to a provider, tests
 * included), the other metrics are counts.
 *
 * Enforcement happens where a request asks for more, never in the worker: a
 * mailing that was accepted always finishes, so a limit can never cut an
 * audience in half. It is decided at `mailings.send` for the whole mailing.
 */

/** The billing period a workspace is metered over at `now`. */
export function periodOf(billing: BillingRow, now: Date = new Date()): { start: string; end: string } {
  if (billing.current_period_start && billing.current_period_end && billing.plan !== 'free' && !billing.billing_exempt) {
    const start = new Date(billing.current_period_start);
    const end = new Date(billing.current_period_end);
    if (start <= now && now < end) return { start: start.toISOString(), end: end.toISOString() };
  }
  // Free and exempt workspaces, and a paid one whose renewal has not been
  // mirrored yet: the calendar month in UTC.
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { start: start.toISOString(), end: end.toISOString() };
}

function warningsOf(metrics: Usage['metrics']): UsageWarning[] {
  const out: UsageWarning[] = [];
  for (const metric of USAGE_METRICS) {
    const m = metrics[metric];
    if (!m || m.limit === null || m.limit === 0) continue;
    if (m.used >= m.limit) out.push({ metric, used: m.used, limit: m.limit, level: 'reached' });
    else if (m.used >= m.limit * USAGE_WARNING_RATIO) out.push({ metric, used: m.used, limit: m.limit, level: 'approaching' });
  }
  return out;
}

async function billingOf(db: Db, workspaceId: string, lock: boolean): Promise<BillingRow> {
  const r = repos(db);
  const row = lock ? await r.billing.lock(workspaceId) : await r.billing.get(workspaceId);
  // Migration 0015 gives every workspace a row, by backfill and by trigger.
  if (!row) throw new Error(`workspace ${workspaceId} has no billing row`);
  return row;
}

export async function computeUsage(db: Db, workspaceId: string, now: Date = new Date()): Promise<Usage> {
  const r = repos(db);
  const billing = await billingOf(db, workspaceId, false);
  const limits = PLANS[billing.plan].limits;
  const period = periodOf(billing, now);
  const [messages, counts] = await Promise.all([r.billing.messagesBetween(workspaceId, period.start, period.end), r.billing.counts(workspaceId)]);
  const used: Record<UsageMetric, number> = { messages, ...counts };
  const metrics = Object.fromEntries(USAGE_METRICS.map((m) => [m, { used: used[m], limit: limitOf(limits, m) }])) as Usage['metrics'];
  return { plan: billing.plan, period_start: period.start, period_end: period.end, metrics, warnings: warningsOf(metrics) };
}

/** The `x-mail-usage-warning` value (`messages=8200/10000,...`), or null when nothing is at 80 percent. */
export function usageWarningHeader(usage: Usage): string | null {
  if (usage.warnings.length === 0) return null;
  return usage.warnings.map((w) => `${w.metric}=${w.used}/${w.limit}`).join(',');
}

function limitReached(message: string, details: Record<string, unknown>): never {
  throw new ApiError('plan_limit_reached', message, details);
}

/**
 * Checked after a row was inserted, inside the same transaction: locks the
 * workspace's billing row, counts, and throws `plan_limit_reached` (rolling the
 * insert back) when the count now exceeds the plan. Counting after the insert
 * means a no-op upsert never counts, and the lock serialises two inserts of one
 * workspace, so the second one sees the first.
 */
export async function assertWithinLimit(tx: Db, workspaceId: string, metric: Exclude<UsageMetric, 'messages'>): Promise<void> {
  const billing = await billingOf(tx, workspaceId, true);
  const limit = limitOf(PLANS[billing.plan].limits, metric);
  if (limit === null) return;
  const count = (await repos(tx).billing.counts(workspaceId))[metric];
  if (count > limit) {
    limitReached(`The ${PLANS[billing.plan].name} plan allows ${limit} ${metric.replace('_', ' ')}. Upgrade the plan or remove some first.`, {
      metric,
      used: count - 1,
      limit,
      plan: billing.plan,
    });
  }
}

/**
 * Before a mailing starts: its whole audience must fit into what is left of
 * the period, after what was sent and what started mailings still hold. A
 * mailing is refused whole rather than started and cut off.
 */
export async function assertCanSend(tx: Db, workspaceId: string, recipients: number, now: Date = new Date()): Promise<void> {
  const billing = await billingOf(tx, workspaceId, true);
  const limit = PLANS[billing.plan].limits.monthly_messages;
  if (limit === null) return;
  const r = repos(tx);
  const period = periodOf(billing, now);
  const [used, pending] = await Promise.all([r.billing.messagesBetween(workspaceId, period.start, period.end), r.billing.pendingRecipients(workspaceId)]);
  if (used + pending + recipients > limit) {
    const left = Math.max(0, limit - used - pending);
    limitReached(
      `This mailing has ${recipients} recipients, and the ${PLANS[billing.plan].name} plan has ${left} of ${limit} left this period. Upgrade the plan, or send to fewer recipients.`,
      { metric: 'messages', used, pending, requested: recipients, limit, plan: billing.plan, period_end: period.end },
    );
  }
}

/** A test send is one more recipient on the period, refused once the period is used up. */
export async function assertCanTest(tx: Db, workspaceId: string, now: Date = new Date()): Promise<void> {
  await assertCanSend(tx, workspaceId, 1, now);
}

/** A plan feature (A/B testing, tracking, custom domains) the workspace's plan must include. */
export async function assertFeature(db: Db, workspaceId: string, feature: PlanFeature): Promise<void> {
  const billing = await billingOf(db, workspaceId, false);
  if (!PLANS[billing.plan].features[feature]) {
    limitReached(`The ${PLANS[billing.plan].name} plan does not include ${feature.replace('_', ' ')}. Upgrade the plan to use it.`, {
      feature,
      plan: billing.plan,
    });
  }
}
