'use client';

import { useEffect, useId, useRef, useState, useTransition, type ReactNode } from 'react';
import type { ActionResult } from '@/lib/result';
import { Button, ErrorPanel, Input } from './ui';

/**
 * A modal on the native <dialog>: it traps focus, closes on Escape and returns
 * focus to the opener by itself. Used only where focus must be protected: a
 * destructive confirmation, or a secret shown exactly once.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  dismissible = true,
  width = 'max-w-[440px]',
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  /** false for a dialog that must be acknowledged with its own button (a secret shown once). */
  dismissible?: boolean;
  width?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descId = useId();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
      onCancel={(e) => {
        e.preventDefault();
        if (dismissible) onClose();
      }}
      onClick={(e) => {
        if (dismissible && e.target === ref.current) onClose();
      }}
      className={`m-auto w-[calc(100%-32px)] ${width} rounded-2xl border border-line-strong bg-panel p-0 shadow-[var(--shadow-pop)] backdrop:bg-black/70`}
    >
      {open ? (
        <div className="flex flex-col gap-4 p-6">
          <div>
            <h2 id={titleId} className="text-[16px] font-semibold text-ink">
              {title}
            </h2>
            {description ? (
              <div id={descId} className="mt-1.5 text-[13.5px] text-muted">
                {description}
              </div>
            ) : null}
          </div>
          {children}
          {footer ? <div className="flex flex-wrap justify-end gap-2 pt-1">{footer}</div> : null}
        </div>
      ) : null}
    </dialog>
  );
}

/**
 * The branded confirmation for a destructive action (never window.confirm).
 * With `confirmText`, the person types it first (erasing a contact, deleting a
 * workspace-wide resource). Shows the action's error in place and stays open,
 * so a failure is never mistaken for success.
 */
export function ConfirmDialog({
  open,
  onClose,
  title,
  description,
  confirmLabel,
  confirmText,
  tone = 'danger',
  action,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description: ReactNode;
  confirmLabel: string;
  confirmText?: string;
  tone?: 'danger' | 'primary';
  action: () => Promise<ActionResult<unknown>>;
  onDone?: () => void;
}) {
  const [typed, setTyped] = useState('');
  const [error, setError] = useState<{ message: string; requestId?: string | null } | null>(null);
  const [pending, start] = useTransition();
  const inputId = useId();

  useEffect(() => {
    if (open) {
      setTyped('');
      setError(null);
    }
  }, [open]);

  const blocked = confirmText !== undefined && typed.trim() !== confirmText;

  return (
    <Dialog
      open={open}
      onClose={() => !pending && onClose()}
      title={title}
      description={description}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending} autoFocus>
            Cancel
          </Button>
          <Button
            variant={tone === 'danger' ? 'danger' : 'primary'}
            busy={pending}
            disabled={blocked}
            onClick={() =>
              start(async () => {
                const result = await action();
                if (result.ok) {
                  onClose();
                  onDone?.();
                } else {
                  setError({ message: result.error.message, requestId: result.error.requestId });
                }
              })
            }
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      {confirmText !== undefined ? (
        <div className="flex flex-col gap-1.5">
          <label htmlFor={inputId} className="text-[12.5px] text-muted">
            Type <span className="font-mono text-ink">{confirmText}</span> to confirm
          </label>
          <Input id={inputId} value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" spellCheck={false} />
        </div>
      ) : null}
      {error ? <ErrorPanel title="Nothing was changed" message={error.message} requestId={error.requestId} /> : null}
    </Dialog>
  );
}

/**
 * A secret shown exactly once (a new API key, a webhook signing secret). It
 * cannot be dismissed by Escape or a backdrop click, only by the button that
 * says the person has stored it.
 */
export function SecretOnceDialog({
  open,
  onClose,
  title,
  secret,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  secret: string;
  children?: ReactNode;
}) {
  const [copied, setCopied] = useState<'idle' | 'copied' | 'failed'>('idle');
  useEffect(() => {
    if (open) setCopied('idle');
  }, [open]);
  return (
    <Dialog
      open={open}
      onClose={onClose}
      dismissible={false}
      width="max-w-[560px]"
      title={title}
      description="Copy it now and store it somewhere safe. It is shown only this once; if it is lost, create a new one."
      footer={
        <Button variant="primary" onClick={onClose}>
          I have stored it
        </Button>
      }
    >
      <div className="flex items-stretch gap-2">
        <code
          data-testid="secret-value"
          className="min-w-0 flex-1 rounded-lg border border-line-strong bg-bg px-3 py-2 font-mono text-[12.5px] break-all text-ink select-all"
        >
          {secret}
        </code>
        <Button
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(secret);
              setCopied('copied');
            } catch {
              setCopied('failed');
            }
          }}
        >
          Copy
        </Button>
      </div>
      <p aria-live="polite" className="min-h-[18px] text-[12.5px] text-muted">
        {copied === 'copied'
          ? 'Copied to the clipboard.'
          : copied === 'failed'
            ? 'The clipboard is not available here; select the text and copy it.'
            : ''}
      </p>
      {children}
    </Dialog>
  );
}
