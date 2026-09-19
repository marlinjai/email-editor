'use server';

import type { Subscription } from '@marlinjai/mail-sdk';
import { act, DashboardRefusal } from '@/lib/action';
import { auth } from '@/lib/auth';
import { mail } from '@/lib/mail';
import type { ActionResult } from '@/lib/result';
import { billingPath } from '@/lib/usage';

/*
 * Stripe Checkout to subscribe and the Stripe customer portal to change or
 * cancel. Both answer with a Stripe-hosted address the browser goes to; the
 * service refuses both (503, `billing_not_configured`) until Stripe is set up
 * for the instance, which the screen shows as "billing not yet available".
 */

const PAID = new Set(['starter', 'growth']);

export async function startCheckout(ws: string, plan: string): Promise<ActionResult<{ url: string }>> {
  if (!PAID.has(plan)) return { ok: false, error: { code: 'invalid_request', message: 'Only Starter and Growth can be bought.' } };
  return act('billing.checkout', async () => {
    const { api } = await mail(ws);
    const back = `${auth.appUrl()}${billingPath(ws)}`;
    const session = await api.billing.checkout({
      plan: plan as 'starter' | 'growth',
      success_url: `${back}?checkout=success`,
      cancel_url: `${back}?checkout=cancelled`,
    });
    return assertStripeUrl(session.url);
  });
}

export async function openPortal(ws: string): Promise<ActionResult<{ url: string }>> {
  return act('billing.portal', async () => {
    const { api } = await mail(ws);
    const session = await api.billing.portal({ return_url: `${auth.appUrl()}${billingPath(ws)}` });
    return assertStripeUrl(session.url);
  });
}

/** The browser is sent to this address, so only an https Stripe page is accepted. */
function assertStripeUrl(url: string): { url: string } {
  let host: string;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') throw new Error('not https');
    host = parsed.hostname;
  } catch {
    throw new DashboardRefusal('internal_error', 'The billing page address the service returned is not valid. Nothing was charged.');
  }
  if (host !== 'stripe.com' && !host.endsWith('.stripe.com')) {
    throw new DashboardRefusal('internal_error', 'The billing page address the service returned is not a Stripe page. Nothing was charged.');
  }
  return { url };
}

/** The subscription as Stripe's webhook has left it, for the screen that waits for an upgrade to be confirmed. */
export async function getSubscription(ws: string): Promise<ActionResult<Subscription>> {
  return act('billing.subscription', async () => (await mail(ws)).api.billing.subscription());
}
