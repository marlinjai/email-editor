import { BILLING_NOT_CONFIGURED_REASON } from '@marlinjai/mail-contract';

/*
 * Client-safe (the contract only, no SDK): the Billing screen reads these in
 * the browser, the error layer on the server.
 */

/**
 * Checkout and the portal answer `service_unavailable` with this reason until
 * Stripe is configured for the instance: not a passing outage, so it is not
 * worded as one.
 */
export function isBillingNotConfigured(code: string, details: Record<string, unknown> | undefined): boolean {
  return code === 'service_unavailable' && details?.reason === BILLING_NOT_CONFIGURED_REASON;
}

export const BILLING_NOT_CONFIGURED =
  'Billing is not available yet: paid plans cannot be bought here until payments are set up. Nothing was charged, and the workspace keeps its current plan.';
