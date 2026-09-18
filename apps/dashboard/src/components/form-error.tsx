'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ActionError } from '@/lib/result';
import { billingPath } from '@/lib/usage';

/** The workspace id in a `/w/<id>/...` path, or null outside a workspace. */
function workspaceOf(pathname: string | null): string | null {
  const match = /^\/w\/([^/]+)/.exec(pathname ?? '');
  return match ? decodeURIComponent(match[1]!) : null;
}

/**
 * The form-level error line, announced when it appears. A plan limit links to
 * the Billing screen, where the plan and the usage behind the refusal are.
 */
export function FormError({ error }: { error: ActionError | null }) {
  const pathname = usePathname();
  const ws = workspaceOf(pathname);
  const onBilling = ws !== null && pathname === billingPath(ws);
  return (
    <div aria-live="assertive" className="empty:hidden">
      {error ? (
        <p role="alert" className="rounded-lg border border-[rgba(255,138,128,0.3)] bg-danger-wash px-3 py-2 text-[13px] text-danger">
          {error.message}
          {error.code === 'plan_limit_reached' && ws && !onBilling ? (
            <>
              {' '}
              <Link href={billingPath(ws)} className="font-medium text-ink underline decoration-line-strong underline-offset-2 hover:decoration-ink">
                See plans and usage
              </Link>
            </>
          ) : null}
          {error.requestId ? <span className="ml-2 font-mono text-[11.5px] text-muted">Request {error.requestId}</span> : null}
        </p>
      ) : null}
    </div>
  );
}
