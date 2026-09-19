'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { USAGE_METRICS, type CatalogPlan, type Plan, type PlanId, type Subscription, type Usage, type UsageMetric } from '@marlinjai/mail-contract';
import { FormError } from '@/components/form-error';
import { Badge, Button, Notice, Panel, Section, Spinner, When, type Tone } from '@/components/ui';
import { useAction } from '@/components/use-action';
import { isBillingNotConfigured } from '@/lib/billing-state';
import { formatCount, percent } from '@/lib/format';
import type { ActionError } from '@/lib/result';
import { formatPrice, METRIC_LABELS, PLAN_NAMES, usageLevel } from '@/lib/usage';
import { getSubscription, openPortal, startCheckout } from './actions';

const STATUS: Record<Subscription['status'], { label: string; tone: Tone }> = {
  active: { label: 'Active', tone: 'ok' },
  trialing: { label: 'Trial', tone: 'gold' },
  past_due: { label: 'Payment overdue', tone: 'warn' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
};

const FEATURE_LABELS: Record<keyof Plan['features'], string> = {
  tracking: 'Open and click tracking',
  ab_testing: 'A/B tests',
  custom_domains: 'Custom domains',
};

const LIMIT_OF: Record<UsageMetric, keyof Plan['limits']> = {
  messages: 'monthly_messages',
  contacts: 'contacts',
  members: 'members',
  providers: 'providers',
  webhook_endpoints: 'webhook_endpoints',
};

/** One metric against its limit, as a meter a screen reader reads out in words. */
function UsageMeter({ metric, used, limit }: { metric: UsageMetric; used: number; limit: number | null }) {
  const label = METRIC_LABELS[metric];
  const level = usageLevel(used, limit);
  const fill = level === 'reached' ? 'bg-danger' : level === 'approaching' ? 'bg-warn' : 'bg-[#8a8373]';
  const text = limit === null ? `${formatCount(used)} ${label.unit}, no limit` : `${formatCount(used)} of ${formatCount(limit)} ${label.unit}`;
  return (
    <div data-testid={`usage-${metric}`}>
      <div className="flex items-baseline justify-between gap-3 text-[13px]">
        <span className="text-ink">
          {label.name}
          {label.period ? <span className="text-faint"> this period</span> : null}
        </span>
        <span className={`tabular ${level === 'reached' ? 'text-danger' : level === 'approaching' ? 'text-warn' : 'text-muted'}`}>
          {limit === null ? `${formatCount(used)} · no limit` : `${formatCount(used)} / ${formatCount(limit)}`}
        </span>
      </div>
      <div
        role="meter"
        aria-label={label.name}
        aria-valuemin={0}
        aria-valuemax={limit ?? Math.max(used, 1)}
        aria-valuenow={limit === null ? used : Math.min(used, limit)}
        aria-valuetext={`${text}${level === 'reached' ? ', limit reached' : level === 'approaching' ? ', close to the limit' : ''}`}
        className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/[0.06]"
      >
        {limit === null ? null : <div className={`h-full rounded-full ${fill}`} style={{ width: `${Math.max(used > 0 ? 2 : 0, percent(used, limit))}%` }} />}
      </div>
    </div>
  );
}

function limitLine(plan: Plan, metric: UsageMetric): string {
  const limit = plan.limits[LIMIT_OF[metric]];
  const label = METRIC_LABELS[metric];
  if (limit === null) return `Unlimited ${label.unit}`;
  return `${formatCount(limit)} ${limit === 1 ? label.one : label.unit}${label.period ? ' a month' : ''}`;
}

export function BillingView({
  ws,
  plans,
  usage,
  subscription,
  canAdmin,
  returned,
}: {
  ws: string;
  plans: CatalogPlan[];
  usage: Usage;
  subscription: Subscription | null;
  canAdmin: boolean;
  returned: 'success' | 'cancelled' | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const checkout = useAction();
  const portal = useAction();
  const [busyPlan, setBusyPlan] = useState<PlanId | null>(null);
  const error: ActionError | null = checkout.error ?? portal.error;
  // Known up front from the catalogue (`sellable`, the same signal checkout
  // uses), and also learned from a refusal: a 503 billing_not_configured after
  // the page loaded (the configuration changed) disables every button too.
  const refused = error !== null && isBillingNotConfigured(error.code, error.details);
  const billingLive = !refused && plans.some((p) => p.monthly_price_cents && p.sellable);
  const canBuy = (plan: CatalogPlan) => !refused && plan.sellable;

  // Back from Stripe: the notice shows once, and the address loses its query so
  // a reload or a bookmark does not show it again.
  const [back] = useState(returned);
  useEffect(() => {
    if (returned) router.replace(pathname, { scroll: false });
  }, [returned, pathname, router]);

  // After a checkout, the plan changes when Stripe's webhook reaches the
  // service, usually within seconds. Until then the screen says the upgrade is
  // being confirmed and asks for the subscription every 3 seconds, for a minute.
  const [confirm, setConfirm] = useState<'waiting' | 'confirmed' | 'late' | null>(back === 'success' && canAdmin ? 'waiting' : null);
  const [confirmedPlan, setConfirmedPlan] = useState<PlanId | null>(null);
  useEffect(() => {
    if (confirm !== 'waiting') return;
    const startPlan = usage.plan;
    let tries = 0;
    let stopped = false;
    const timer = setInterval(async () => {
      tries += 1;
      const r = await getSubscription(ws).catch(() => null);
      if (stopped) return;
      if (r?.ok && r.data.plan !== startPlan) {
        clearInterval(timer);
        setConfirmedPlan(r.data.plan);
        setConfirm('confirmed');
        router.refresh();
      } else if (tries >= 20) {
        clearInterval(timer);
        setConfirm('late');
      }
    }, 3_000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [confirm, ws, usage.plan, router]);

  const current = plans.find((p) => p.id === usage.plan);
  const currentName = current?.name ?? PLAN_NAMES[usage.plan];
  const exempt = subscription?.billing_exempt === true || usage.plan === 'design_partner';
  const paying = usage.plan === 'starter' || usage.plan === 'growth';
  const price = current ? formatPrice(current) : null;
  const go = (url: string) => window.location.assign(url);

  const buy = (plan: PlanId) => {
    setBusyPlan(plan);
    void checkout.run(() => startCheckout(ws, plan), (s) => go(s.url)).then(() => setBusyPlan(null));
  };
  const manage = () => void portal.run(() => openPortal(ws), (s) => go(s.url));

  return (
    <div className="flex flex-col">
      {back === 'success' ? (
        <div className="mb-6" role="status" aria-live="polite" data-testid="checkout-return">
          {confirm === 'confirmed' ? (
            <Notice tone="ok">Thank you. Your plan is now {PLAN_NAMES[confirmedPlan ?? usage.plan]}.</Notice>
          ) : confirm === 'late' ? (
            <Notice tone="warn">
              Stripe has taken the payment but has not confirmed the new plan to us yet. It usually does within minutes; reload this page
              later. Nothing more to do on your side.
            </Notice>
          ) : confirm === 'waiting' ? (
            <Notice tone="gold">
              <span className="flex items-center gap-2">
                <Spinner /> Thank you. Your upgrade is being confirmed with Stripe; this takes a few seconds.
              </span>
            </Notice>
          ) : (
            <Notice tone="ok">Thank you. The new plan shows here once Stripe has confirmed it.</Notice>
          )}
        </div>
      ) : back === 'cancelled' ? (
        <div className="mb-6" role="status" data-testid="checkout-return">
          <Notice>Checkout was cancelled. Nothing was charged, and the plan is unchanged.</Notice>
        </div>
      ) : null}

      <Panel className="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
        <div className="min-w-0">
          <p className="text-[12px] font-medium tracking-wide text-faint uppercase">Current plan</p>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-[18px] font-semibold text-ink" data-testid="current-plan">
            {currentName}
            {subscription && !exempt && usage.plan !== 'free' ? <Badge tone={STATUS[subscription.status].tone}>{STATUS[subscription.status].label}</Badge> : null}
          </p>
          <p className="mt-1 text-[13px] text-muted">
            {exempt ? (
              'A design partner outside billing: no limits and nothing to pay.'
            ) : (
              <>
                {price ?? 'Not sold'}
                {' · '}
                {subscription?.cancel_at_period_end ? 'Ends on ' : paying ? 'Renews on ' : 'Period ends on '}
                <When at={subscription?.current_period_end ?? usage.period_end} />
              </>
            )}
          </p>
          {subscription?.status === 'past_due' ? (
            <p className="mt-2 text-[13px] text-warn">The last payment did not go through. Update the payment method in the billing portal to keep the plan.</p>
          ) : null}
        </div>
        {canAdmin && paying && !exempt ? (
          <Button onClick={manage} busy={portal.pending} disabled={!billingLive}>
            {billingLive ? 'Manage billing' : 'Billing portal not yet available'}
          </Button>
        ) : null}
      </Panel>

      <div className="mt-3">
        <FormError error={refused ? null : error} />
      </div>

      <Section
        title="Usage"
        description={
          <>
            Messages count every recipient handed to a provider this period, tests included, from <When at={usage.period_start} /> to{' '}
            <When at={usage.period_end} />. The other counts are what the workspace has now.
          </>
        }
      >
        <div className="grid gap-5 sm:grid-cols-2">
          {USAGE_METRICS.map((m) => (
            <UsageMeter key={m} metric={m} used={usage.metrics[m]?.used ?? 0} limit={usage.metrics[m]?.limit ?? null} />
          ))}
        </div>
      </Section>

      {exempt ? null : (
        <Section
          title="Plans"
          description={
            canAdmin
              ? 'Upgrading opens a Stripe checkout. A paid plan is changed or cancelled in the billing portal.'
              : 'Only an admin or owner of the workspace can change the plan.'
          }
        >
          {!billingLive ? (
            <div className="mb-4" role="status" data-testid="billing-unavailable">
              <Notice tone="warn">
                <span className="font-medium text-ink">Billing is not available yet.</span> Paid plans cannot be bought here until payments are
                set up. Nothing was charged, and the {currentName} plan&apos;s limits apply until then.
              </Notice>
            </div>
          ) : null}
          <ul className="grid gap-3 md:grid-cols-3">
            {plans.map((plan) => {
              const isCurrent = plan.id === usage.plan;
              const planPrice = formatPrice(plan);
              const paid = plan.id === 'starter' || plan.id === 'growth';
              return (
                <li key={plan.id} data-testid={`plan-${plan.id}`}>
                  <Panel className={`flex h-full flex-col gap-4 px-4 py-4 ${isCurrent ? 'border-[rgba(224,187,84,0.35)]' : ''}`}>
                    <div>
                      <p className="flex items-center gap-2 text-[14px] font-semibold text-ink">
                        {plan.name}
                        {isCurrent ? <Badge tone="gold">Current</Badge> : null}
                      </p>
                      <p className="mt-0.5 text-[13px] text-muted">{planPrice ?? 'Not sold'}</p>
                    </div>
                    <ul className="flex flex-1 flex-col gap-1 text-[12.5px] text-muted">
                      {USAGE_METRICS.map((m) => (
                        <li key={m}>{limitLine(plan, m)}</li>
                      ))}
                      {(Object.keys(FEATURE_LABELS) as Array<keyof Plan['features']>).map((f) => (
                        <li key={f} className={plan.features[f] ? 'text-ink' : 'text-faint line-through decoration-faint/60'}>
                          <span className="sr-only">{plan.features[f] ? 'Included: ' : 'Not included: '}</span>
                          {FEATURE_LABELS[f]}
                        </li>
                      ))}
                    </ul>
                    {canAdmin && !isCurrent ? (
                      paying ? (
                        <Button onClick={manage} busy={portal.pending} disabled={!billingLive}>
                          {billingLive ? 'Change in billing portal' : 'Not yet available'}
                        </Button>
                      ) : paid ? (
                        <>
                          <Button
                            variant={plan.id === 'starter' ? 'primary' : 'secondary'}
                            busy={busyPlan === plan.id}
                            disabled={!canBuy(plan) || busyPlan !== null}
                            onClick={() => buy(plan.id)}
                          >
                            {canBuy(plan) ? `Upgrade to ${plan.name}` : 'Not yet available'}
                          </Button>
                          {billingLive && !canBuy(plan) ? <p className="text-[12px] text-faint">This plan cannot be bought here yet.</p> : null}
                        </>
                      ) : null
                    ) : null}
                  </Panel>
                </li>
              );
            })}
          </ul>
        </Section>
      )}
    </div>
  );
}
