'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useId, useRef, useState } from 'react';
import type { Mailing, MailingCounts, MessageSummary, RecipientBatchResult } from '@marlinjai/mail-contract';
import { ConfirmDialog, Dialog } from '@/components/dialog';
import { FormError } from '@/components/form-error';
import { Button, describedBy, Field, Input, Notice, Spinner, Textarea, When } from '@/components/ui';
import { useAction } from '@/components/use-action';
import { formatCount, percent } from '@/lib/format';
import { parseRecipients, PROBLEM_LABELS, type ParseResult } from '@/lib/recipients';
import { addRecipients, controlMailing, duplicateMailing, preflight, retryFailed, sendTest } from '../actions';

/** The live sending rail: sent in brushed gold, failed and skipped beside it, queued as the empty track. */
export function ProgressRail({ counts, live }: { counts: MailingCounts; live: boolean }) {
  const total = counts.total;
  const seg = (n: number) => `${total === 0 ? 0 : (n / total) * 100}%`;
  const settled = counts.sent + counts.failed + counts.skipped;
  const pct = percent(settled, total);
  return (
    <div>
      <div
        role="progressbar"
        aria-label="Sending progress"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={settled}
        aria-valuetext={`${formatCount(settled)} of ${formatCount(total)} recipients settled: ${formatCount(counts.sent)} sent, ${formatCount(counts.failed)} failed, ${formatCount(counts.skipped)} skipped`}
        className="flex h-2.5 overflow-hidden rounded-full bg-white/[0.06]"
      >
        <div className="gold-surface h-full border-0 transition-[width] duration-300 ease-[var(--ease-out)]" style={{ width: seg(counts.sent) }} />
        <div className="h-full bg-danger transition-[width] duration-300 ease-[var(--ease-out)]" style={{ width: seg(counts.failed) }} />
        <div className="h-full bg-[#6b6558] transition-[width] duration-300 ease-[var(--ease-out)]" style={{ width: seg(counts.skipped) }} />
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-[12.5px] sm:grid-cols-6">
        {[
          ['Recipients', counts.total, 'text-ink'],
          ['Queued', counts.queued, 'text-muted'],
          ['Sending', counts.sending, 'text-gold'],
          ['Sent', counts.sent, 'text-ok'],
          ['Failed', counts.failed, counts.failed > 0 ? 'text-danger' : 'text-muted'],
          ['Skipped', counts.skipped, 'text-muted'],
        ].map(([label, n, tone]) => (
          <div key={label as string}>
            <dt className="text-faint">{label}</dt>
            <dd className={`tabular text-[15px] font-semibold ${tone}`}>{formatCount(n as number)}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-2 text-[12px] text-faint" aria-live="polite">
        {live ? `${pct} % settled. Updating live.` : null}
      </p>
    </div>
  );
}

type Preflight = { recipients: number; remainingBudget: number | null; compileErrors: number; hasUnsubscribe: boolean };

/** Send, with what the service would refuse checked first and the daily budget spelled out. */
export function SendDialog({ ws, mailing, open, onClose, onSent }: { ws: string; mailing: Mailing; open: boolean; onClose: () => void; onSent: (m: Mailing) => void }) {
  const check = useAction();
  const send = useAction();
  const [pf, setPf] = useState<Preflight | null>(null);
  useEffect(() => {
    if (!open) return;
    setPf(null);
    void check.run(() => preflight(ws, mailing.id), setPf);
  }, [open, ws, mailing.id]);
  const blocking = pf ? (pf.recipients === 0 ? 'Add at least one recipient first.' : pf.compileErrors > 0 ? 'The email does not compile; fix the template first.' : !pf.hasUnsubscribe ? 'The email has no {{unsubscribe_url}} link. Add one to the template and update this mailing from it.' : null) : null;
  return (
    <Dialog
      open={open}
      onClose={() => !send.pending && onClose()}
      title="Send this mailing?"
      description="Sending starts right away and cannot be undone. You can pause or cancel while it runs; messages already sent stay sent."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={send.pending} autoFocus>
            Cancel
          </Button>
          <Button variant="primary" busy={send.pending} disabled={!pf || blocking !== null} onClick={() => void send.run(() => controlMailing(ws, mailing.id, 'send'), onSent)}>
            Send to {pf ? formatCount(pf.recipients) : '…'} recipients
          </Button>
        </>
      }
    >
      {check.pending ? (
        <p role="status" className="flex items-center gap-2 text-[13px] text-muted">
          <Spinner /> Checking the mailing
        </p>
      ) : null}
      <FormError error={check.error} />
      {pf ? (
        <div className="flex flex-col gap-2 text-[13px]">
          <p>
            <span className="text-muted">Subject:</span> <span className="text-ink">{mailing.subject}</span>
          </p>
          <p>
            <span className="text-muted">Topic:</span> <span className="font-mono text-ink">{mailing.topic}</span>
          </p>
          {blocking ? <Notice tone="danger">{blocking}</Notice> : null}
          {!blocking && pf.remainingBudget !== null && pf.remainingBudget < pf.recipients ? (
            <Notice tone="warn">
              The provider has {formatCount(pf.remainingBudget)} of its daily budget left. The rest waits and goes out automatically as the budget frees up over the next 24 hours.
            </Notice>
          ) : null}
          <p className="text-[12.5px] text-faint">Suppressed and unsubscribed addresses are skipped at send time, whatever the list says.</p>
        </div>
      ) : null}
      <FormError error={send.error} />
    </Dialog>
  );
}

/** Pause, resume, cancel, retry and duplicate: the controls the mailing's state allows. */
export function Controls({
  ws,
  mailing,
  allowed,
  outcomeUnknown,
  onChange,
}: {
  ws: string;
  mailing: Mailing;
  allowed: { send: boolean; pause: boolean; resume: boolean; cancel: boolean; retryFailed: boolean; duplicate: boolean };
  outcomeUnknown: number;
  onChange: (m: Mailing) => void;
}) {
  const router = useRouter();
  const act = useAction();
  const [sending, setSending] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [includeUnknown, setIncludeUnknown] = useState(false);
  const retry = useAction();
  const unknownId = useId();

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap justify-end gap-2">
        {allowed.pause ? (
          <Button busy={act.pending} onClick={() => void act.run(() => controlMailing(ws, mailing.id, 'pause'), onChange)}>
            Pause
          </Button>
        ) : null}
        {allowed.resume ? (
          <Button variant="primary" busy={act.pending} onClick={() => void act.run(() => controlMailing(ws, mailing.id, 'resume'), onChange)}>
            Resume
          </Button>
        ) : null}
        {allowed.retryFailed ? <Button onClick={() => setRetrying(true)}>Retry failed</Button> : null}
        {allowed.duplicate ? (
          <Button busy={act.pending} onClick={() => void act.run(() => duplicateMailing(ws, mailing.id), (r) => router.push(`/w/${ws}/mailings/${r.id}`))}>
            Duplicate
          </Button>
        ) : null}
        {allowed.cancel ? (
          <Button variant="ghost" onClick={() => setCancelling(true)}>
            Cancel mailing
          </Button>
        ) : null}
        {allowed.send ? (
          <Button variant="primary" onClick={() => setSending(true)}>
            Send
          </Button>
        ) : null}
      </div>
      {act.error ? <FormError error={act.error} /> : null}
      <SendDialog
        ws={ws}
        mailing={mailing}
        open={sending}
        onClose={() => setSending(false)}
        onSent={(m) => {
          setSending(false);
          onChange(m);
        }}
      />
      <ConfirmDialog
        open={cancelling}
        onClose={() => setCancelling(false)}
        title="Cancel this mailing?"
        description="Recipients still queued are skipped and nothing more is sent. Messages already sent stay sent. A cancelled mailing cannot be restarted; duplicate it to send again."
        confirmLabel="Cancel mailing"
        action={async () => {
          const r = await controlMailing(ws, mailing.id, 'cancel');
          if (r.ok) onChange(r.data);
          return r;
        }}
      />
      <Dialog
        open={retrying}
        onClose={() => !retry.pending && setRetrying(false)}
        title="Retry failed recipients?"
        description={`The ${formatCount(mailing.counts.failed)} failed recipients are queued again and the mailing goes back to sending.`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setRetrying(false)} disabled={retry.pending}>
              Cancel
            </Button>
            <Button
              variant="primary"
              busy={retry.pending}
              onClick={() =>
                void retry.run(
                  () => retryFailed(ws, mailing.id, includeUnknown),
                  (m) => {
                    setRetrying(false);
                    setIncludeUnknown(false);
                    onChange(m);
                  },
                )
              }
            >
              Retry
            </Button>
          </>
        }
      >
        {outcomeUnknown > 0 ? (
          <div className="flex items-start gap-3 rounded-lg border border-[rgba(240,192,90,0.22)] bg-warn-wash p-3">
            <input id={unknownId} type="checkbox" checked={includeUnknown} onChange={(e) => setIncludeUnknown(e.target.checked)} className="mt-0.5 size-4 accent-[var(--gold)]" />
            <label htmlFor={unknownId} className="text-[13px] text-ink">
              Also retry {formatCount(outcomeUnknown)} recipient{outcomeUnknown === 1 ? '' : 's'} whose outcome is unknown
              <span className="mt-0.5 block text-[12.5px] text-muted">
                The service stopped while sending to them. They may already have the email; retrying can send it twice.
              </span>
            </label>
          </div>
        ) : null}
        <FormError error={retry.error} />
      </Dialog>
    </div>
  );
}

/** A test to one address, and the last one, marked out of date once the content changed after it. */
export function TestSend({ ws, mailing, lastTest, defaultTo, canWrite }: { ws: string; mailing: Mailing; lastTest: MessageSummary | null; defaultTo: string; canWrite: boolean }) {
  const router = useRouter();
  const { run, pending, error, fields } = useAction();
  const [to, setTo] = useState(defaultTo);
  const [firstName, setFirstName] = useState('');
  const stale = lastTest !== null && new Date(lastTest.created_at).getTime() < new Date(mailing.updated_at).getTime();
  return (
    <div className="flex flex-col gap-4">
      {lastTest ? (
        <Notice tone={lastTest.outcome === 'failed' ? 'danger' : stale ? 'warn' : 'ok'}>
          <span data-testid="last-test">
            Last test to <span className="font-medium text-ink">{lastTest.to}</span> <When at={lastTest.created_at} />:{' '}
            {lastTest.outcome === 'failed' ? `failed (${lastTest.error ?? 'no reason given'})` : 'sent'}.
            {stale ? ' The mailing changed since; send a new test to see the current version.' : null}
          </span>
        </Notice>
      ) : (
        <p className="text-[13px] text-muted">No test sent yet. A test goes to one address outside the recipient list and is marked as a test in the archive.</p>
      )}
      {canWrite && mailing.status !== 'cancelled' ? (
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void run(() => sendTest(ws, mailing.id, { to, firstName }), () => router.refresh());
          }}
        >
          <Field id="t-to" label="Send a test to" error={fields.to} className="min-w-[240px] flex-1">
            <Input {...describedBy('t-to', fields.to)} type="email" value={to} onChange={(e) => setTo(e.target.value)} required />
          </Field>
          <Field id="t-name" label="First name to merge (optional)" className="w-56">
            <Input id="t-name" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
          </Field>
          <Button type="submit" busy={pending}>
            Send test
          </Button>
        </form>
      ) : null}
      <FormError error={error && !error.fields ? error : null} />
    </div>
  );
}

/** Paste or upload a list, see what will be added before adding it, then the service's verdict per address. */
export function AddRecipients({ ws, mailingId }: { ws: string; mailingId: string }) {
  const router = useRouter();
  const { run, pending, error } = useAction();
  const [text, setText] = useState('');
  const [parsed, setParsed] = useState<ParseResult | null>(null);
  const [result, setResult] = useState<(RecipientBatchResult & { emails: string[] }) | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const textId = useId();

  const check = (value: string) => {
    setResult(null);
    setParsed(value.trim() ? parseRecipients(value) : null);
  };

  return (
    <div className="flex flex-col gap-4">
      <Field
        id={textId}
        label="Addresses"
        hint="One per line: an address, optionally with a first name after a comma. Or a CSV with email and first_name columns. Up to 1,000 at a time."
      >
        <Textarea
          {...describedBy(textId, undefined, true)}
          rows={6}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            check(e.target.value);
          }}
          placeholder={'ana@example.com, Ana\nben@example.com'}
          className="font-mono text-[12.5px]"
          spellCheck={false}
        />
      </Field>
      <div className="flex flex-wrap items-center gap-3">
        <input
          ref={fileRef}
          type="file"
          accept=".csv,.txt,text/csv,text/plain"
          aria-label="Upload a CSV file"
          onChange={async (e) => {
            setFileError(null);
            const f = e.target.files?.[0];
            if (!f) return;
            if (f.size > 2 * 1024 * 1024) {
              setFileError('That file is larger than 2 MB. Split it into lists of up to 1,000 addresses.');
              return;
            }
            const content = await f.text();
            setText(content);
            check(content);
            if (fileRef.current) fileRef.current.value = '';
          }}
          className="text-[13px] text-muted file:mr-3 file:rounded-lg file:border file:border-line-strong file:bg-raised file:px-3 file:py-1.5 file:text-[13px] file:text-ink"
        />
        {fileError ? <span role="alert" className="text-[12.5px] text-danger">{fileError}</span> : null}
      </div>
      {parsed ? (
        <div aria-live="polite" className="flex flex-col gap-2 text-[13px]">
          <p className="text-ink">
            {formatCount(parsed.recipients.length)} address{parsed.recipients.length === 1 ? '' : 'es'} ready
            {parsed.problems.length > 0 ? `, ${formatCount(parsed.problems.length)} line${parsed.problems.length === 1 ? '' : 's'} skipped` : ''}.
          </p>
          {parsed.overLimit ? <Notice tone="warn">Only the first 1,000 are added in one go. Add the rest afterwards.</Notice> : null}
          {parsed.problems.length > 0 ? (
            <details className="rounded-lg border border-line px-3 py-2">
              <summary className="cursor-pointer text-muted">Skipped lines</summary>
              <ul className="mt-2 flex max-h-48 flex-col gap-1 overflow-y-auto font-mono text-[12px]">
                {parsed.problems.map((p) => (
                  <li key={p.line}>
                    <span className="text-faint">line {p.line}:</span> {p.text} <span className="text-danger">({PROBLEM_LABELS[p.reason]})</span>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </div>
      ) : null}
      <FormError error={error} />
      {result ? (
        <Notice tone={result.rejected.length > 0 ? 'warn' : 'ok'}>
          <span data-testid="add-result">
            Added {formatCount(result.added)}. {formatCount(result.already_present)} already on this mailing
            {result.rejected.length > 0 ? `, ${formatCount(result.rejected.length)} rejected` : ''}.
          </span>
          {result.rejected.length > 0 ? (
            <ul className="mt-1 font-mono text-[12px]">
              {result.rejected.map((r) => (
                <li key={r.index}>
                  {result.emails[r.index]} ({r.reason === 'duplicate_in_batch' ? 'listed twice' : 'no such contact'})
                </li>
              ))}
            </ul>
          ) : null}
        </Notice>
      ) : null}
      <Button
        variant="primary"
        className="self-start"
        busy={pending}
        disabled={!parsed || parsed.recipients.length === 0}
        onClick={() =>
          parsed &&
          void run(
            () => addRecipients(ws, mailingId, parsed.recipients),
            (r) => {
              setResult(r);
              setText('');
              setParsed(null);
              router.refresh();
            },
          )
        }
      >
        Add {parsed ? formatCount(parsed.recipients.length) : ''} recipients
      </Button>
    </div>
  );
}
