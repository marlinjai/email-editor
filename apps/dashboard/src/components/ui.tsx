import Link from 'next/link';
import type { ComponentProps, ReactNode } from 'react';

/*
 * The dashboard's component vocabulary: one button shape, one field shape, one
 * table, one empty and one error state. Server-safe (no hooks), so server and
 * client components share it.
 */

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

const BUTTON_BASE =
  'inline-flex items-center justify-center gap-2 rounded-lg px-3.5 h-9 text-[13px] font-semibold whitespace-nowrap select-none transition-[filter,background-color,border-color,transform] duration-150 ease-[var(--ease-out)] active:translate-y-px disabled:cursor-not-allowed disabled:opacity-45 disabled:active:translate-y-0';

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: 'gold-surface hover:brightness-110 disabled:hover:brightness-100',
  secondary: 'bg-raised text-ink border border-line-strong hover:border-[rgba(255,255,255,0.28)] hover:bg-[#23201a]',
  ghost: 'text-muted hover:text-ink hover:bg-white/5 border border-transparent',
  danger: 'bg-danger-solid text-white border border-[rgba(255,138,128,0.4)] hover:brightness-110',
};

export function buttonClass(variant: ButtonVariant = 'secondary', extra = ''): string {
  return `${BUTTON_BASE} ${BUTTON_VARIANTS[variant]} ${extra}`;
}

export function Button({
  variant = 'secondary',
  busy = false,
  className = '',
  children,
  disabled,
  ...rest
}: ComponentProps<'button'> & { variant?: ButtonVariant; busy?: boolean }) {
  return (
    // `button` unless the caller says `submit`: inside a form, a bare <button>
    // submits it, so an "Add", "Remove" or "Delete" there would also save.
    <button type="button" {...rest} disabled={disabled || busy} aria-busy={busy || undefined} className={buttonClass(variant, className)}>
      {busy ? <Spinner /> : null}
      {children}
    </button>
  );
}

export function LinkButton({ variant = 'secondary', className = '', ...rest }: ComponentProps<typeof Link> & { variant?: ButtonVariant }) {
  return <Link {...rest} className={buttonClass(variant, className)} />;
}

export function Spinner({ label }: { label?: string }) {
  return (
    <svg
      className="size-3.5 animate-spin"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden={label ? undefined : true}
      role={label ? 'img' : undefined}
      aria-label={label}
    >
      <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2" />
      <path d="M14.5 8A6.5 6.5 0 0 0 8 1.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

const CONTROL =
  'rounded-lg bg-panel-2 border border-line-strong px-3 h-9 text-[13.5px] text-ink placeholder:text-faint transition-colors duration-150 hover:border-[rgba(255,255,255,0.26)] focus:border-gold focus:outline-none focus-visible:outline-2 focus-visible:outline-gold aria-[invalid=true]:border-danger disabled:opacity-50';

/**
 * A control fills its container unless the caller gives it a width: both
 * classes on one element would leave the winner to the stylesheet's order.
 */
function control(className: string): string {
  const sized = /(^|\s)(w-|min-w-|flex-1\b|basis-)/.test(className);
  return `${CONTROL} ${sized ? '' : 'w-full'} ${className}`;
}

export function Input({ className = '', ...rest }: ComponentProps<'input'>) {
  return <input {...rest} className={control(className)} />;
}

export function Textarea({ className = '', ...rest }: ComponentProps<'textarea'>) {
  return <textarea {...rest} className={control(`h-auto py-2 leading-relaxed ${className}`)} />;
}

export function Select({ className = '', children, ...rest }: ComponentProps<'select'>) {
  return (
    <select {...rest} className={control(`select-chevron appearance-none pr-8 ${className}`)}>
      {children}
    </select>
  );
}

/** A labelled control with its hint and its error, wired for screen readers. */
export function Field({
  id,
  label,
  hint,
  error,
  children,
  className = '',
}: {
  id: string;
  label: ReactNode;
  hint?: ReactNode;
  error?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <label htmlFor={id} className="text-[12.5px] font-medium text-muted">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="text-[12.5px] text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-[12.5px] text-faint">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/** aria props for a control inside a Field. */
export function describedBy(id: string, error?: string, hint?: unknown) {
  return {
    id,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': error ? `${id}-error` : hint ? `${id}-hint` : undefined,
  } as const;
}

export type Tone = 'neutral' | 'gold' | 'ok' | 'warn' | 'danger';

const TONES: Record<Tone, string> = {
  neutral: 'text-muted bg-white/5 border-line',
  gold: 'text-gold bg-gold-wash border-[rgba(224,187,84,0.25)]',
  ok: 'text-ok bg-ok-wash border-[rgba(95,217,163,0.22)]',
  warn: 'text-warn bg-warn-wash border-[rgba(240,192,90,0.22)]',
  danger: 'text-danger bg-danger-wash border-[rgba(255,138,128,0.22)]',
};

export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-md border px-1.5 py-px text-[11.5px] font-medium ${TONES[tone]}`}>
      {children}
    </span>
  );
}

export function PageHeader({ title, description, actions }: { title: ReactNode; description?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4 pb-6">
      <div className="min-w-0">
        <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-ink">{title}</h1>
        {description ? <p className="mt-1 max-w-[68ch] text-[13.5px] text-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

export function Section({
  title,
  description,
  actions,
  children,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="border-t border-line pt-6 pb-8">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-semibold text-ink">{title}</h2>
          {description ? <p className="mt-0.5 max-w-[68ch] text-[13px] text-muted">{description}</p> : null}
        </div>
        {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}

export function Panel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-xl border border-line bg-panel ${className}`}>{children}</div>;
}

/** An empty state that says what belongs here and how to get it. */
export function EmptyState({ title, children, action }: { title: ReactNode; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-line-strong px-6 py-10 text-center">
      <p className="text-[14px] font-semibold text-ink">{title}</p>
      {children ? <div className="mx-auto mt-1.5 max-w-[56ch] text-[13px] text-muted">{children}</div> : null}
      {action ? <div className="mt-5 flex justify-center gap-2">{action}</div> : null}
    </div>
  );
}

/** A failure the person can read, with the service's request id for support. */
export function ErrorPanel({
  title = 'This could not be loaded',
  message,
  requestId,
  action,
}: {
  title?: string;
  message: string;
  requestId?: string | null;
  action?: ReactNode;
}) {
  return (
    <div role="alert" className="rounded-xl border border-[rgba(255,138,128,0.3)] bg-danger-wash px-5 py-4">
      <p className="text-[14px] font-semibold text-danger">{title}</p>
      <p className="mt-1 text-[13px] text-ink">{message}</p>
      {requestId ? <p className="mt-1 font-mono text-[11.5px] text-muted">Request {requestId}</p> : null}
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}

export function Notice({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return <div className={`rounded-lg border px-3.5 py-2.5 text-[13px] ${TONES[tone]}`}>{children}</div>;
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`skeleton ${className}`} aria-hidden="true" />;
}

/** A list page's loading state: the header's shape and a few table rows. */
export function TableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div role="status" aria-label="Loading" className="flex flex-col gap-2">
      <Skeleton className="h-8 w-56" />
      <div className="mt-4 flex flex-col gap-1.5">
        {Array.from({ length: rows }, (_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    </div>
  );
}

export function Table({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-line bg-panel">
      <table aria-label={label} className="w-full border-collapse text-left text-[13px]">
        {children}
      </table>
    </div>
  );
}

export function Th({ children, className = '' }: { children?: ReactNode; className?: string }) {
  return (
    <th
      scope="col"
      className={`border-b border-line px-4 py-2.5 text-[11.5px] font-medium tracking-wide text-faint uppercase ${className}`}
    >
      {children}
    </th>
  );
}

export function Td({ children, className = '' }: { children?: ReactNode; className?: string }) {
  return <td className={`border-b border-line px-4 py-2.5 align-middle text-ink ${className}`}>{children}</td>;
}

export function Mono({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <span className={`font-mono text-[12px] text-muted ${className}`}>{children}</span>;
}

/** A timestamp rendered on the server in UTC-agnostic, locale-stable form. */
export function When({ at }: { at: string | null }) {
  if (!at) return <span className="text-faint">never</span>;
  const d = new Date(at);
  return (
    <time dateTime={at} title={d.toISOString()} className="tabular whitespace-nowrap text-muted">
      {d.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Berlin' })}
    </time>
  );
}
