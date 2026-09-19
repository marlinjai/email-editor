import Link from 'next/link';
import { billingPath } from '@/lib/usage';

/** Why a control is off: the plan lacks the feature, and where to change the plan. */
export function PlanGate({ ws, planName, feature }: { ws: string; planName: string; feature: string }) {
  return (
    <p className="text-[12.5px] text-muted" data-testid="plan-gate">
      The {planName} plan does not include {feature}.{' '}
      <Link href={billingPath(ws)} className="font-medium text-ink underline decoration-line-strong underline-offset-2">
        See plans and usage
      </Link>
    </p>
  );
}
