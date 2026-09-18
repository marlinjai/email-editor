import type { ActionError } from '@/lib/result';

/** The form-level error line, announced when it appears. */
export function FormError({ error }: { error: ActionError | null }) {
  return (
    <div aria-live="assertive" className="empty:hidden">
      {error ? (
        <p role="alert" className="rounded-lg border border-[rgba(255,138,128,0.3)] bg-danger-wash px-3 py-2 text-[13px] text-danger">
          {error.message}
          {error.requestId ? <span className="ml-2 font-mono text-[11.5px] text-muted">Request {error.requestId}</span> : null}
        </p>
      ) : null}
    </div>
  );
}
