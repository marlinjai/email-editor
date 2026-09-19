'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useId, useState } from 'react';
import type { Mailing, MailingAnalytics, RecipientBatchResult, Segment, TemplateSummary } from '@marlinjai/mail-contract';
import { ConfirmDialog, Dialog } from '@/components/dialog';
import { PlanGate } from '@/components/plan-gate';
import { FormError } from '@/components/form-error';
import { Badge, Button, describedBy, Field, Input, Mono, Notice, Select, Table, Td, Th, When } from '@/components/ui';
import { useAction } from '@/components/use-action';
import { formatCount, percent } from '@/lib/format';
import { addSegmentAudience, mailingAnalytics, pickAbWinner, removeAbTest, saveAbTest, scheduleMailing, unscheduleMailing } from '../actions';

/*
 * The mailing screen's S4 parts: taking an audience from a segment,
 * scheduling, the A/B test and the analytics.
 */

/** `YYYY-MM-DDTHH:mm` in the browser's own time zone, for a datetime-local input. */
function localInputValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function ScheduleDialog({ ws, mailing, open, onClose, onDone }: { ws: string; mailing: Mailing; open: boolean; onClose: () => void; onDone: (m: Mailing) => void }) {
  const { run, pending, error, fields, clearError } = useAction();
  const [value, setValue] = useState('');
  const [zone, setZone] = useState('');
  useEffect(() => {
    if (!open) return;
    clearError();
    // Default: the current schedule, or the next full hour at least 30 minutes away.
    const next = mailing.scheduled_at ? new Date(mailing.scheduled_at) : new Date(Math.ceil((Date.now() + 30 * 60_000) / 3_600_000) * 3_600_000);
    setValue(localInputValue(next));
    setZone(Intl.DateTimeFormat().resolvedOptions().timeZone);
  }, [open, mailing.scheduled_at]);
  const sendAt = value ? new Date(value) : null;
  return (
    <Dialog
      open={open}
      onClose={() => !pending && onClose()}
      title={mailing.status === 'scheduled' ? 'Move the scheduled time' : 'Schedule this mailing'}
      description="It goes out on its own at that time. The same checks as sending run now, so it cannot fail later for a reason known today. Until then you can still edit it, move it or unschedule it."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button
            variant="primary"
            busy={pending}
            disabled={!sendAt || Number.isNaN(sendAt.getTime())}
            onClick={() =>
              void run(
                () => scheduleMailing(ws, mailing.id, { sendAt: sendAt!.toISOString() }),
                (m) => {
                  onClose();
                  onDone(m);
                },
              )
            }
          >
            Schedule
          </Button>
        </>
      }
    >
      <Field id="sched-at" label="Send at" hint={zone ? `Your time zone, ${zone}.` : undefined} error={fields.sendAt}>
        <Input {...describedBy('sched-at', fields.sendAt, Boolean(zone))} type="datetime-local" value={value} onChange={(e) => setValue(e.target.value)} required />
      </Field>
      <FormError error={error && !error.fields ? error : null} />
    </Dialog>
  );
}

export function ScheduledNotice({ ws, mailing, canWrite, onChange }: { ws: string; mailing: Mailing; canWrite: boolean; onChange: (m: Mailing) => void }) {
  const [moving, setMoving] = useState(false);
  const unschedule = useAction();
  if (mailing.status !== 'scheduled' || !mailing.scheduled_at) return null;
  return (
    <div className="mb-6 flex flex-col gap-2">
      <Notice tone="gold">
        <span className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span data-testid="scheduled-for">
            Scheduled for <When at={mailing.scheduled_at} />.
          </span>
          {canWrite ? (
            <span className="flex gap-2">
              <Button variant="ghost" className="h-7 px-2" onClick={() => setMoving(true)}>
                Change time
              </Button>
              <Button variant="ghost" className="h-7 px-2" busy={unschedule.pending} onClick={() => void unschedule.run(() => unscheduleMailing(ws, mailing.id), onChange)}>
                Unschedule
              </Button>
            </span>
          ) : null}
        </span>
      </Notice>
      <FormError error={unschedule.error} />
      <ScheduleDialog ws={ws} mailing={mailing} open={moving} onClose={() => setMoving(false)} onDone={onChange} />
    </div>
  );
}

/** Queues a segment's current members who are subscribed to the mailing's topic. */
export function SegmentAudience({ ws, mailing, segments }: { ws: string; mailing: Mailing; segments: Segment[] }) {
  const router = useRouter();
  const { run, pending, error } = useAction();
  const [segmentId, setSegmentId] = useState('');
  const [result, setResult] = useState<RecipientBatchResult | null>(null);
  const selectId = useId();
  if (segments.length === 0) {
    return <p className="text-[13px] text-muted">No segments yet. Build one under Contacts, Segments, to send to a saved audience.</p>;
  }
  return (
    <div className="flex flex-col gap-3">
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setResult(null);
          void run(
            () => addSegmentAudience(ws, mailing.id, segmentId),
            (r) => {
              setResult(r);
              router.refresh();
            },
          );
        }}
      >
        <div className="flex flex-col gap-1.5">
          <label htmlFor={selectId} className="text-[12.5px] font-medium text-muted">
            Segment
          </label>
          <Select id={selectId} value={segmentId} onChange={(e) => setSegmentId(e.target.value)} className="w-72">
            <option value="">Choose a segment</option>
            {segments.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({formatCount(s.contact_count)})
              </option>
            ))}
          </Select>
        </div>
        <Button type="submit" busy={pending} disabled={!segmentId}>
          Add its contacts
        </Button>
      </form>
      <p className="text-[12.5px] text-faint">
        Only contacts subscribed to <Mono>{mailing.topic}</Mono> are added, as the segment stands now. Suppressions are checked again when each mail is sent.
      </p>
      <FormError error={error} />
      {result ? (
        <Notice tone="ok">
          <span data-testid="segment-result">
            {formatCount(result.added)} added
            {result.already_present ? `, ${formatCount(result.already_present)} already on the list` : ''}
            {result.rejected.length ? `, ${formatCount(result.rejected.length)} left out` : ''}.
          </span>
        </Notice>
      ) : null}
    </div>
  );
}

const LETTERS = 'abcde'.split('');
type VariantDraft = { key: string; subject: string; templateId: string };

/** The A/B test: set up while the mailing is a draft, followed and decided once it sends. */
export function AbTestSection({
  ws,
  mailing,
  templates,
  trackingOn,
  canWrite,
  editable,
  plan,
  onChange,
}: {
  ws: string;
  mailing: Mailing;
  templates: TemplateSummary[];
  trackingOn: boolean;
  canWrite: boolean;
  editable: boolean;
  /** Null when the plan could not be read: the service still refuses what the plan lacks. */
  plan: { name: string; included: boolean } | null;
  onChange: (m: Mailing) => void;
}) {
  const ab = mailing.ab_test;
  const [editing, setEditing] = useState(false);
  const [removing, setRemoving] = useState(false);
  const pick = useAction();

  if (ab && !editing) {
    const deciding = ab.status === 'testing' || ab.status === 'awaiting_pick';
    return (
      <div className="flex flex-col gap-4" data-testid="ab-test">
        <div className="flex flex-wrap items-center gap-2 text-[13px]">
          <Badge tone={ab.status === 'decided' ? 'ok' : ab.status === 'awaiting_pick' ? 'warn' : 'gold'}>
            {{ pending: 'Set up', testing: 'Testing', awaiting_pick: 'Waiting for a pick', decided: 'Decided' }[ab.status]}
          </Badge>
          <span className="text-muted">
            {Math.round(ab.test_fraction * 100)} % of recipients split across {ab.variants.length} variants;{' '}
            {ab.winner_metric === 'manual'
              ? 'you pick the winner.'
              : `the variant with the most unique ${ab.winner_metric} after ${formatMinutes(ab.decide_after_minutes ?? 0)} wins.`}
          </span>
        </div>
        {ab.decide_at && ab.status === 'testing' ? (
          <p className="text-[12.5px] text-muted">
            Decides at <When at={ab.decide_at} />.
          </p>
        ) : null}
        {ab.status === 'awaiting_pick' && ab.winner_metric !== 'manual' ? (
          <Notice tone="warn">The test reached its time without tracking data it can use, so a person picks the winner.</Notice>
        ) : null}
        <Table label="Variants">
          <thead>
            <tr>
              <Th className="w-16">Variant</Th>
              <Th>Subject</Th>
              <Th>Content</Th>
              {canWrite && deciding ? <Th className="w-0">{''}</Th> : null}
            </tr>
          </thead>
          <tbody>
            {ab.variants.map((v) => (
              <tr key={v.key}>
                <Td>
                  <span className="flex items-center gap-2 font-semibold uppercase">
                    {v.key}
                    {ab.winner === v.key ? <Badge tone="ok">winner</Badge> : null}
                  </span>
                </Td>
                <Td>{v.subject ?? <span className="text-faint">the mailing&apos;s subject</span>}</Td>
                <Td className="text-muted">{v.has_document ? 'its own content' : "the mailing's content"}</Td>
                {canWrite && deciding ? (
                  <Td>
                    <Button busy={pick.pending} onClick={() => void pick.run(() => pickAbWinner(ws, mailing.id, v.key), onChange)}>
                      Send {v.key.toUpperCase()} to the rest
                    </Button>
                  </Td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </Table>
        {ab.decided_at ? (
          <p className="text-[12.5px] text-muted">
            Variant {ab.winner?.toUpperCase()} was picked {ab.decided_by === 'manual' ? 'by hand' : `by ${ab.winner_metric}`} <When at={ab.decided_at} />.
          </p>
        ) : null}
        <FormError error={pick.error} />
        {canWrite && editable ? (
          <div className="flex gap-2">
            <Button onClick={() => setEditing(true)}>Change the test</Button>
            <Button variant="ghost" onClick={() => setRemoving(true)}>
              Remove the test
            </Button>
          </div>
        ) : null}
        <ConfirmDialog
          open={removing}
          onClose={() => setRemoving(false)}
          title="Remove the A/B test?"
          description="Everyone gets the mailing's own subject and content."
          confirmLabel="Remove test"
          tone="primary"
          action={async () => {
            const r = await removeAbTest(ws, mailing.id);
            if (r.ok) onChange(r.data);
            return r;
          }}
        />
      </div>
    );
  }

  if (!canWrite || !editable) {
    return <p className="text-[13px] text-muted">{ab ? '' : 'This mailing was sent without an A/B test.'}</p>;
  }
  if (!editing) {
    const gated = plan !== null && !plan.included;
    return (
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-[13px] text-muted">Send two to five versions of the subject or content to a share of the recipients first, then the best one to the rest.</p>
          <Button onClick={() => setEditing(true)} disabled={gated}>
            Set up an A/B test
          </Button>
        </div>
        {gated ? <PlanGate ws={ws} planName={plan.name} feature="A/B tests" /> : null}
      </div>
    );
  }
  return (
    <AbTestForm
      ws={ws}
      mailing={mailing}
      templates={templates}
      trackingOn={trackingOn}
      onCancel={() => setEditing(false)}
      onSaved={(m) => {
        setEditing(false);
        onChange(m);
      }}
    />
  );
}

function formatMinutes(minutes: number): string {
  if (minutes % 1440 === 0) return `${minutes / 1440} ${minutes === 1440 ? 'day' : 'days'}`;
  if (minutes % 60 === 0) return `${minutes / 60} ${minutes === 60 ? 'hour' : 'hours'}`;
  return `${minutes} minutes`;
}

function AbTestForm({
  ws,
  mailing,
  templates,
  trackingOn,
  onCancel,
  onSaved,
}: {
  ws: string;
  mailing: Mailing;
  templates: TemplateSummary[];
  trackingOn: boolean;
  onCancel: () => void;
  onSaved: (m: Mailing) => void;
}) {
  const { run, pending, error, fields } = useAction();
  const ab = mailing.ab_test;
  // Changing a test starts from its subjects; its contents are re-chosen, since the variant keeps only a copy.
  const [variants, setVariants] = useState<VariantDraft[]>(() =>
    ab ? ab.variants.map((v) => ({ key: v.key, subject: v.subject ?? '', templateId: '' })) : [
      { key: 'a', subject: mailing.subject, templateId: '' },
      { key: 'b', subject: '', templateId: '' },
    ],
  );
  const [testPercent, setTestPercent] = useState(ab ? Math.round(ab.test_fraction * 100) : 20);
  const [metric, setMetric] = useState<'opens' | 'clicks' | 'manual'>(ab?.winner_metric ?? (trackingOn ? 'opens' : 'manual'));
  const [hours, setHours] = useState(ab?.decide_after_minutes ? ab.decide_after_minutes / 60 : 4);
  const hadDocuments = ab?.variants.some((v) => v.has_document) ?? false;

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        void run(
          () =>
            saveAbTest(ws, mailing.id, {
              variants,
              testPercent,
              winnerMetric: metric,
              decideAfterMinutes: metric === 'manual' ? null : Math.round(hours * 60),
            }),
          onSaved,
        );
      }}
    >
      {hadDocuments ? <Notice tone="warn">Variants with their own content need their template chosen again; otherwise they keep the mailing&apos;s content.</Notice> : null}
      <ul className="flex flex-col gap-3">
        {variants.map((v, i) => (
          <li key={v.key} className="grid gap-2 sm:grid-cols-[40px_1fr_240px_auto] sm:items-start">
            <span className="pt-2 text-[13px] font-semibold text-ink uppercase">{v.key}</span>
            <div>
              <Input
                aria-label={`Subject of variant ${v.key.toUpperCase()}`}
                placeholder="Subject (empty keeps the mailing's)"
                value={v.subject}
                onChange={(e) => setVariants((xs) => xs.map((x, j) => (j === i ? { ...x, subject: e.target.value } : x)))}
                maxLength={998}
              />
              {fields[`variants.${i}`] ? <p className="mt-1 text-[12px] text-danger">{fields[`variants.${i}`]}</p> : null}
            </div>
            <Select
              aria-label={`Content of variant ${v.key.toUpperCase()}`}
              value={v.templateId}
              onChange={(e) => setVariants((xs) => xs.map((x, j) => (j === i ? { ...x, templateId: e.target.value } : x)))}
            >
              <option value="">The mailing&apos;s content</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} (v{t.version})
                </option>
              ))}
            </Select>
            {variants.length > 2 ? (
              <Button variant="ghost" onClick={() => setVariants((xs) => xs.filter((_, j) => j !== i).map((x, j) => ({ ...x, key: LETTERS[j]! })))} aria-label={`Remove variant ${v.key.toUpperCase()}`}>
                Remove
              </Button>
            ) : (
              <span />
            )}
          </li>
        ))}
      </ul>
      {fields.variants ? <p className="text-[12px] text-danger">{fields.variants}</p> : null}
      {variants.length < 5 ? (
        <div>
          <Button variant="ghost" onClick={() => setVariants((xs) => [...xs, { key: LETTERS[xs.length]!, subject: '', templateId: '' }])}>
            Add a variant
          </Button>
        </div>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-3">
        <Field id="ab-share" label="Test group" hint="Share of recipients, split evenly across the variants." error={fields.testPercent}>
          <div className="flex items-center gap-2">
            <Input {...describedBy('ab-share', fields.testPercent, true)} type="number" min={1} max={100} step={1} value={testPercent} onChange={(e) => setTestPercent(e.target.valueAsNumber)} className="w-24" />
            <span className="text-[13px] text-muted">%</span>
          </div>
        </Field>
        <Field id="ab-metric" label="The winner is" hint={trackingOn ? undefined : 'Opens and clicks need tracking, which is off in this workspace.'} error={fields.winnerMetric}>
          <Select {...describedBy('ab-metric', fields.winnerMetric, !trackingOn)} value={metric} onChange={(e) => setMetric(e.target.value as typeof metric)}>
            <option value="opens" disabled={!trackingOn}>
              the most unique opens
            </option>
            <option value="clicks" disabled={!trackingOn}>
              the most unique clicks
            </option>
            <option value="manual">picked by hand</option>
          </Select>
        </Field>
        {metric !== 'manual' ? (
          <Field id="ab-after" label="Decided after" hint="From 15 minutes to 7 days." error={fields.decideAfterMinutes}>
            <div className="flex items-center gap-2">
              <Input {...describedBy('ab-after', fields.decideAfterMinutes, true)} type="number" min={0.25} max={168} step={0.25} value={hours} onChange={(e) => setHours(e.target.valueAsNumber)} className="w-24" />
              <span className="text-[13px] text-muted">hours</span>
            </div>
          </Field>
        ) : null}
      </div>
      <FormError error={error && !error.fields ? error : null} />
      <div className="flex gap-2">
        <Button type="submit" variant="primary" busy={pending}>
          Save the test
        </Button>
        <Button variant="ghost" onClick={onCancel} disabled={pending}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function Rate({ part, whole }: { part: number | null; whole: number }) {
  if (part === null) return <span className="text-faint">not tracked</span>;
  return (
    <>
      {formatCount(part)} <span className="text-faint">({percent(part, whole)} %)</span>
    </>
  );
}

/** Opens, clicks, unsubscribes, bounces and complaints, fetched when the section opens and on demand. */
export function AnalyticsSection({ ws, mailing }: { ws: string; mailing: Mailing }) {
  const load = useAction();
  const [data, setData] = useState<MailingAnalytics | null>(null);
  useEffect(() => {
    void load.run(() => mailingAnalytics(ws, mailing.id), setData);
    // Re-read when the counts move; the analytics follow the same sends.
  }, [ws, mailing.id, mailing.counts.sent]);

  if (!data) return load.error ? <FormError error={load.error} /> : <p className="text-[13px] text-muted">Loading the numbers.</p>;
  const sent = data.counts.sent;
  const tracked = data.tracking;
  return (
    <div className="flex flex-col gap-5" data-testid="analytics">
      {!tracked || (!tracked.opens && !tracked.clicks) ? (
        <Notice>Opens and clicks were not tracked for this mailing. Tracking is set in Settings and applies to mailings started after it was turned on.</Notice>
      ) : null}
      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-[13px] sm:grid-cols-4">
        <div>
          <dt className="text-faint">Delivered to a provider</dt>
          <dd className="tabular text-[18px] font-semibold text-ink">{formatCount(sent)}</dd>
        </div>
        <div>
          <dt className="text-faint">Unique opens</dt>
          <dd className="tabular text-[18px] font-semibold text-ink">
            <Rate part={data.unique_opens} whole={sent} />
          </dd>
        </div>
        <div>
          <dt className="text-faint">Unique clicks</dt>
          <dd className="tabular text-[18px] font-semibold text-ink">
            <Rate part={data.unique_clicks} whole={sent} />
          </dd>
        </div>
        <div>
          <dt className="text-faint">Unsubscribed</dt>
          <dd className="tabular text-[18px] font-semibold text-ink">
            <Rate part={data.unsubscribes} whole={sent} />
          </dd>
        </div>
        <div>
          <dt className="text-faint">Bounced</dt>
          <dd className="tabular text-ink">{formatCount(data.bounces)}</dd>
        </div>
        <div>
          <dt className="text-faint">Complaints</dt>
          <dd className="tabular text-ink">{formatCount(data.complaints)}</dd>
        </div>
        {data.apple_mpp_opens !== null ? (
          <div>
            <dt className="text-faint">Apple Mail privacy opens</dt>
            <dd className="tabular text-ink" title="Apple Mail Privacy Protection loads every image on delivery: counted apart, never as a person opening the mail.">
              {formatCount(data.apple_mpp_opens)}
            </dd>
          </div>
        ) : null}
        {data.machine_events !== null ? (
          <div>
            <dt className="text-faint">Filtered machine events</dt>
            <dd className="tabular text-ink" title="Security scanners and link prefetchers, left out of the unique counts.">
              {formatCount(data.machine_events)}
            </dd>
          </div>
        ) : null}
      </dl>
      {data.variants && data.variants.length > 0 ? (
        <Table label="Results per variant">
          <thead>
            <tr>
              <Th>Variant</Th>
              <Th className="text-right">Sent</Th>
              <Th className="text-right">Unique opens</Th>
              <Th className="text-right">Unique clicks</Th>
            </tr>
          </thead>
          <tbody>
            {data.variants.map((v) => (
              <tr key={v.key}>
                <Td className="font-semibold uppercase">{v.key}</Td>
                <Td className="tabular text-right">{formatCount(v.sent)}</Td>
                <Td className="tabular text-right">
                  <Rate part={v.unique_opens} whole={v.sent} />
                </Td>
                <Td className="tabular text-right">
                  <Rate part={v.unique_clicks} whole={v.sent} />
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      ) : null}
      {data.links && data.links.length > 0 ? (
        <Table label="Clicks per link">
          <thead>
            <tr>
              <Th>Link</Th>
              <Th className="text-right">Unique clicks</Th>
            </tr>
          </thead>
          <tbody>
            {data.links.map((l) => (
              <tr key={l.url}>
                <Td className="max-w-[56ch] truncate font-mono text-[12px]">
                  <span title={l.url}>{l.url}</span>
                </Td>
                <Td className="tabular text-right">{formatCount(l.unique_clicks)}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      ) : null}
    </div>
  );
}
