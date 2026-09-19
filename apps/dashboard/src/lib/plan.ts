import 'server-only';
import type { PlanFeatures, PlanId } from '@marlinjai/mail-sdk';
import { act } from './action';
import { mail } from './mail';
import type { ActionResult } from './result';
import { PLAN_NAMES } from './usage';

export type WorkspacePlan = { plan: PlanId; name: string; features: PlanFeatures };

/**
 * The workspace's plan and what it includes, so a screen can say up front that
 * a feature needs another plan instead of waiting for the service's 429. The
 * plan comes from `billing.usage` (every member may read it) and its features
 * from the catalogue; the design partners' plan, which the catalogue does not
 * list, includes everything.
 */
export async function workspacePlan(ws: string): Promise<ActionResult<WorkspacePlan>> {
  return act('billing.plan', async () => {
    const { api } = await mail(ws);
    const [usage, plans] = await Promise.all([api.billing.usage(), api.billing.plans()]);
    const listed = plans.data.find((p) => p.id === usage.plan);
    const features: PlanFeatures = listed?.features ?? { ab_testing: true, tracking: true, custom_domains: true };
    return { plan: usage.plan, name: listed?.name ?? PLAN_NAMES[usage.plan], features };
  });
}
