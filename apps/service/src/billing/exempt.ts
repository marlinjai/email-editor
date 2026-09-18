import type { Sql } from '../db.js';
import { repos } from '../repo/index.js';
import type { BillingRow } from '../repo/billing.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class ExemptionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ExemptionError';
  }
}

/**
 * Puts a workspace outside billing (a design partner: plan `design_partner`,
 * no limits, no checkout) or back into it. The only writer of
 * `billing_exempt`: the operator command `main.js billing-exempt`, which needs
 * the database itself. No API route, key scope or member role reaches it.
 *
 * Lifting an exemption drops the workspace to `free` and marks its mirror
 * stale, so the next reconciliation (or read of `billing.subscription`)
 * restores any plan it still pays for. An exempt workspace that still has a
 * paid subscription keeps being charged by Stripe: cancel that in Stripe.
 */
export async function setExemption(sql: Sql, workspace: string, exempt: boolean, reason: string): Promise<BillingRow> {
  const trimmed = reason.trim();
  if (exempt && trimmed.length === 0) throw new ExemptionError('an exemption needs a reason (who and why), for the audit log');
  if (trimmed.length > 500) throw new ExemptionError('the reason is longer than 500 characters');
  return (await sql.begin(async (tx) => {
    const r = repos(tx);
    const workspaceId = UUID.test(workspace) ? workspace.toLowerCase() : await r.billing.workspaceIdForSlugForOperator(workspace);
    if (!workspaceId) throw new ExemptionError(`no workspace "${workspace}"`);
    const before = await r.billing.lock(workspaceId);
    if (!before) throw new ExemptionError(`no workspace "${workspace}"`);
    const after = (await r.billing.setExempt(workspaceId, exempt, trimmed || null))!;
    if (before.billing_exempt !== exempt) {
      await r.audit.record(workspaceId, {
        action: 'billing.exemption_changed',
        actor: { type: 'system', reason: `operator: ${trimmed || (exempt ? 'exempted' : 'exemption lifted')}`.slice(0, 200) },
        targetType: 'workspace',
        targetId: workspaceId,
        details: { billing_exempt: exempt, from_plan: before.plan, to_plan: after.plan },
      });
    }
    return after;
  })) as BillingRow;
}
