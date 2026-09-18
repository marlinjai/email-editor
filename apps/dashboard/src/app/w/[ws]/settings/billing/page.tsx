import type { Metadata } from 'next';
import { ErrorPanel } from '@/components/ui';
import { act } from '@/lib/action';
import { mail } from '@/lib/mail';
import { can } from '@/lib/roles';
import { workspaceContext } from '@/lib/workspace';
import { BillingView } from './view';

export const metadata: Metadata = { title: 'Billing' };

export default async function BillingPage({ params, searchParams }: { params: Promise<{ ws: string }>; searchParams: Promise<{ checkout?: string }> }) {
  const { ws } = await params;
  const { checkout } = await searchParams;
  const ctx = await workspaceContext(ws);
  const role = ctx.ok && ctx.data ? ctx.data.role : 'viewer';
  const isAdmin = can(role, 'admin');

  const [plans, usage, subscription] = await Promise.all([
    act('billing.plans', async () => (await mail(ws)).api.billing.plans()),
    act('billing.usage', async () => (await mail(ws)).api.billing.usage()),
    // The subscription (status, renewal, cancellation) is for admins; everyone sees the plan through usage.
    isAdmin ? act('billing.subscription', async () => (await mail(ws)).api.billing.subscription()) : Promise.resolve(null),
  ]);
  if (!plans.ok) return <ErrorPanel title="Plans could not be loaded" message={plans.error.message} requestId={plans.error.requestId} />;
  if (!usage.ok) return <ErrorPanel title="Usage could not be loaded" message={usage.error.message} requestId={usage.error.requestId} />;
  if (subscription && !subscription.ok)
    return <ErrorPanel title="The subscription could not be loaded" message={subscription.error.message} requestId={subscription.error.requestId} />;

  return (
    <BillingView
      ws={ws}
      plans={plans.data.data}
      usage={usage.data}
      subscription={subscription ? subscription.data : null}
      canAdmin={isAdmin}
      returned={checkout === 'success' || checkout === 'cancelled' ? checkout : null}
    />
  );
}
