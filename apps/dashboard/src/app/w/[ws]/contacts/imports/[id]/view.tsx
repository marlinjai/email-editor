'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useId, useRef, useState } from 'react';
import {
  IMPORT_ROW_OUTCOMES,
  IMPORT_TERMINAL_STATUSES,
  type ContactPropertyDefinition,
  type ImportJob,
  type ImportReport,
  type ImportRow,
  type ImportRowOutcome,
  type ImportSkipReason,
  type Page,
  type Tag,
  type Topic,
} from '@marlinjai/mail-contract';
import { ConfirmDialog } from '@/components/dialog';
import { FormError } from '@/components/form-error';
import { Badge, Button, EmptyState, Mono, Notice, Panel, Section, Select, Spinner, Table, Td, Th, When } from '@/components/ui';
import { useAction } from '@/components/use-action';
import { formatCount, percent } from '@/lib/format';
import { cancelImport, commitImport, getImport, importRows, setImportMapping } from '../actions';
import { IMPORT_STATUS } from '../status';

const POLL_MS = 1500;

const BASE_TARGETS: Array<{ value: string; label: string }> = [
  { value: 'ignore', label: 'Leave out' },
  { value: 'email', label: 'Email address' },
  { value: 'first_name', label: 'First name' },
  { value: 'last_name', label: 'Last name' },
  { value: 'locale', label: 'Language' },
  { value: 'external_id', label: 'External id' },
];

const OUTCOME_LABELS: Record<ImportRowOutcome, string> = {
  created: 'New contacts',
  updated: 'Updated',
  unchanged: 'Already up to date',
  suppressed: 'Suppressed, left out',
  skipped: 'Skipped',
};

const SKIP_LABELS: Record<ImportSkipReason, string> = {
  missing_email: 'no email address',
  invalid_email: 'not a valid email address',
  duplicate_in_file: 'the address appears earlier in the file',
  invalid_value: 'a value does not fit its property type',
  external_id_conflict: 'the external id belongs to another contact',
  wrong_column_count: 'the row has a different number of columns',
};

type Lookups = { topics: Topic[]; tags: Tag[]; properties: ContactPropertyDefinition[] };

/** What the dry run found, or what the commit wrote. */
function Report({ report, verb }: { report: ImportReport; verb: 'would' | 'did' }) {
  const skipped = Object.entries(report.skipped_by_reason).filter(([, n]) => n > 0) as Array<[ImportSkipReason, number]>;
  return (
    <div className="flex flex-col gap-3" data-testid={verb === 'would' ? 'dry-run' : 'import-result'}>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-5">
        {IMPORT_ROW_OUTCOMES.map((o) => (
          <div key={o}>
            <dt className="text-[12px] text-faint">{OUTCOME_LABELS[o]}</dt>
            <dd className={`tabular text-[18px] font-semibold ${o === 'skipped' && report.skipped > 0 ? 'text-warn' : o === 'created' ? 'text-ok' : 'text-ink'}`} data-testid={`report-${o}`}>
              {formatCount(report[o])}
            </dd>
          </div>
        ))}
      </dl>
      {skipped.length > 0 ? (
        <p className="text-[12.5px] text-muted">
          Skipped because {skipped.map(([reason, n]) => `${SKIP_LABELS[reason]} (${formatCount(n)})`).join(', ')}.
        </p>
      ) : null}
      {report.topics_withheld > 0 ? (
        <p className="text-[12.5px] text-muted">
          {formatCount(report.topics_withheld)} {report.topics_withheld === 1 ? 'contact' : 'contacts'} {verb === 'would' ? 'would not be' : 'were not'} subscribed to some
          topics, because they unsubscribed from them or are suppressed.
        </p>
      ) : null}
    </div>
  );
}

/**
 * The rows of the dry run or the commit, a page at a time, filterable by
 * outcome. Keyed by the dry run or commit it shows (and by whether the server
 * sent a first page), so it starts over when that changes and keeps its filter
 * and pages across refreshes otherwise. Mounted without a first page (a dry
 * run or commit that just finished on this page), it loads one itself.
 */
function Rows({ ws, job, initial }: { ws: string; job: ImportJob; initial: Page<ImportRow> | null }) {
  const [outcome, setOutcome] = useState<ImportRowOutcome | ''>('');
  const [rows, setRows] = useState<ImportRow[]>(initial?.data ?? []);
  const [cursor, setCursor] = useState<string | null>(initial?.next_cursor ?? null);
  const load = useAction();
  const filterId = useId();
  const loadRows = (o: ImportRowOutcome | '', from: string | null) =>
    void load.run(
      () => importRows(ws, job.id, o || null, from),
      (page) => {
        setRows((prev) => (from ? [...prev, ...page.data] : page.data));
        setCursor(page.next_cursor);
      },
    );
  const [loadedOnMount, setLoadedOnMount] = useState(initial !== null);
  useEffect(() => {
    if (loadedOnMount) return;
    setLoadedOnMount(true);
    loadRows('', null);
  }, [loadedOnMount]);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <label htmlFor={filterId} className="text-[12.5px] text-muted">
          Show
        </label>
        <Select
          id={filterId}
          value={outcome}
          onChange={(e) => {
            const o = e.target.value as ImportRowOutcome | '';
            setOutcome(o);
            loadRows(o, null);
          }}
          className="h-8 w-56"
        >
          <option value="">Every row</option>
          {IMPORT_ROW_OUTCOMES.map((o) => (
            <option key={o} value={o}>
              {OUTCOME_LABELS[o]}
            </option>
          ))}
        </Select>
        {load.pending ? <Spinner label="Loading rows" /> : null}
      </div>
      <FormError error={load.error} />
      {rows.length === 0 ? (
        <p className="text-[13px] text-muted">{load.pending ? 'Loading rows.' : 'No rows here.'}</p>
      ) : (
        <Table label="Rows of the file">
          <thead>
            <tr>
              <Th className="w-16 text-right">Row</Th>
              <Th>Email</Th>
              <Th>Outcome</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.row}>
                <Td className="tabular text-right text-muted">{r.row}</Td>
                <Td className="font-mono text-[12px]">{r.email ?? <span className="text-faint">none</span>}</Td>
                <Td>
                  <Badge tone={r.outcome === 'skipped' ? 'warn' : r.outcome === 'suppressed' ? 'neutral' : r.outcome === 'created' ? 'ok' : 'neutral'}>{OUTCOME_LABELS[r.outcome]}</Badge>
                  {r.message ? <span className="ml-2 text-[12px] text-muted">{r.message}</span> : r.reason ? <span className="ml-2 text-[12px] text-muted">{SKIP_LABELS[r.reason]}</span> : null}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      {cursor ? (
        <div>
          <Button onClick={() => loadRows(outcome, cursor)} busy={load.pending}>
            More rows
          </Button>
        </div>
      ) : null}
    </div>
  );
}

/** Step two: which column is what, which topics and tags every row gets, and the consent statement. */
function MappingForm({ ws, job, lookups, onCancel, onMapped }: { ws: string; job: ImportJob; lookups: Lookups; onCancel?: () => void; onMapped: (j: ImportJob) => void }) {
  const { run, pending, error } = useAction();
  const start = job.mapping ?? job.suggested_mapping;
  const [mapping, setMapping] = useState<Record<string, string>>(() => Object.fromEntries(job.columns.map((c) => [c, start[c] ?? 'ignore'])));
  const [topics, setTopics] = useState<string[]>(job.mapping ? job.topics : []);
  const [tags, setTags] = useState<string[]>(job.mapping ? job.tags : []);
  const [updateExisting, setUpdateExisting] = useState(job.mapping ? job.update_existing : true);
  const [consent, setConsent] = useState(false);
  const idp = useId();
  const emailColumns = Object.values(mapping).filter((v) => v === 'email').length;
  const used = new Map<string, number>();
  for (const v of Object.values(mapping)) if (v !== 'ignore') used.set(v, (used.get(v) ?? 0) + 1);

  const targets = [
    ...BASE_TARGETS,
    ...lookups.properties.map((p) => ({ value: `property:${p.key}`, label: `${p.label} (property)` })),
  ];
  const toggle = (list: string[], set: (v: string[]) => void, slug: string) => set(list.includes(slug) ? list.filter((s) => s !== slug) : [...list, slug]);

  return (
    <form
      className="flex flex-col gap-6"
      onSubmit={(e) => {
        e.preventDefault();
        void run(() => setImportMapping(ws, job.id, { mapping, topics, tags, updateExisting, consent: consent as true }), onMapped);
      }}
    >
      <Section title="Columns" description={`${formatCount(job.total_rows)} rows. Choose what each column holds; the first rows of the file are shown to help.`}>
        <Table label="Columns of the file">
          <thead>
            <tr>
              <Th>Column</Th>
              <Th>Holds</Th>
              <Th>First values</Th>
            </tr>
          </thead>
          <tbody>
            {job.columns.map((column, i) => {
              const target = mapping[column] ?? 'ignore';
              const clash = target !== 'ignore' && (used.get(target) ?? 0) > 1;
              const known = targets.some((t) => t.value === target);
              return (
                <tr key={column}>
                  <Td>
                    <Mono className="text-ink">{column}</Mono>
                  </Td>
                  <Td>
                    <Select
                      aria-label={`What the column ${column} holds`}
                      aria-invalid={clash || undefined}
                      value={target}
                      onChange={(e) => setMapping((m) => ({ ...m, [column]: e.target.value }))}
                      className="h-8 w-56"
                    >
                      {targets.map((t) => (
                        <option key={t.value} value={t.value}>
                          {t.label}
                        </option>
                      ))}
                      {!known ? <option value={target}>{target.replace(/^property:/, 'Property ')}</option> : null}
                      {target === 'ignore' && !lookups.properties.some((p) => p.key === column) && /^[A-Za-z0-9_.-]{1,64}$/.test(column) ? (
                        <option value={`property:${column}`}>A property named {column}</option>
                      ) : null}
                    </Select>
                    {clash ? <p className="mt-1 text-[12px] text-danger">Another column already holds this.</p> : null}
                  </Td>
                  <Td className="max-w-[320px] truncate text-[12px] text-muted">
                    {job.sample
                      .map((row) => row[i] ?? '')
                      .filter(Boolean)
                      .slice(0, 3)
                      .join(', ') || <span className="text-faint">empty</span>}
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
        {emailColumns !== 1 ? (
          <p className="mt-2 text-[12.5px] text-warn">{emailColumns === 0 ? 'Choose the column that holds the email address.' : 'Only one column can hold the email address.'}</p>
        ) : null}
      </Section>

      <Section title="Every imported contact gets" description="Topics subscribe the contact; a topic the person unsubscribed from, or an address that is suppressed, is never subscribed.">
        <div className="grid gap-6 sm:grid-cols-2">
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-[12.5px] font-medium text-muted">Topics</legend>
            {lookups.topics.length === 0 ? <p className="text-[12.5px] text-faint">No topics in this workspace.</p> : null}
            {lookups.topics.map((t) => (
              <label key={t.id} className="flex items-center gap-2 text-[13px]">
                <input type="checkbox" checked={topics.includes(t.slug)} onChange={() => toggle(topics, setTopics, t.slug)} className="size-4 accent-[var(--gold)]" />
                {t.name} <Mono>{t.slug}</Mono>
              </label>
            ))}
          </fieldset>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-[12.5px] font-medium text-muted">Tags</legend>
            {lookups.tags.length === 0 ? <p className="text-[12.5px] text-faint">No tags yet. Create them under Tags.</p> : null}
            {lookups.tags.map((t) => (
              <label key={t.id} className="flex items-center gap-2 text-[13px]">
                <input type="checkbox" checked={tags.includes(t.slug)} onChange={() => toggle(tags, setTags, t.slug)} className="size-4 accent-[var(--gold)]" />
                {t.name}
              </label>
            ))}
          </fieldset>
        </div>
        <label className="mt-5 flex items-start gap-3 text-[13px]">
          <input type="checkbox" checked={updateExisting} onChange={(e) => setUpdateExisting(e.target.checked)} className="mt-0.5 size-4 accent-[var(--gold)]" />
          <span>
            Overwrite existing contacts with the file&apos;s values
            <span className="block text-[12.5px] text-muted">Off: existing contacts only gain the topics, the tags and the fields they do not have yet.</span>
          </span>
        </label>
      </Section>

      <div className="flex items-start gap-3 rounded-xl border border-[rgba(224,187,84,0.25)] bg-gold-wash p-4">
        <input id={`${idp}-consent`} type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 size-4 accent-[var(--gold)]" required />
        <label htmlFor={`${idp}-consent`} className="text-[13px] text-ink">
          Everyone in this file agreed to receive mail on the chosen topics.
          <span className="block text-[12.5px] text-muted">Your statement is recorded with the import, with your name and the time.</span>
        </label>
      </div>
      <FormError error={error} />
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="primary" busy={pending} disabled={emailColumns !== 1 || !consent}>
          Check the file
        </Button>
        {onCancel ? (
          <Button variant="ghost" onClick={onCancel} disabled={pending}>
            Keep the current mapping
          </Button>
        ) : null}
        <span className="text-[12.5px] text-faint">A dry run goes through every row first. Nothing is imported yet.</span>
      </div>
    </form>
  );
}

export function ImportView({ ws, initial, lookups, rows, canWrite }: { ws: string; initial: ImportJob; lookups: Lookups; rows: Page<ImportRow> | null; canWrite: boolean }) {
  const router = useRouter();
  const [job, setJob] = useState(initial);
  // The status last seen, outside React state: a change of it reloads the
  // server-rendered parts, which must not happen inside a state updater.
  const lastStatus = useRef(initial.status);
  const [remapping, setRemapping] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [pollError, setPollError] = useState<string | null>(null);
  const commit = useAction();
  useEffect(() => {
    lastStatus.current = initial.status;
    setJob(initial);
  }, [initial]);

  const running = job.status === 'validating' || job.status === 'committing';
  const terminal = IMPORT_TERMINAL_STATUSES.includes(job.status);

  // While the worker runs the dry run or the commit, follow it. A reload
  // resumes from the service's state; nothing is kept in the browser.
  useEffect(() => {
    if (!running) return;
    let stopped = false;
    const timer = setInterval(async () => {
      const r = await getImport(ws, job.id).catch(() => null);
      if (stopped) return;
      if (!r || !r.ok) {
        setPollError(r ? r.error.message : 'The dashboard did not answer.');
        return;
      }
      setPollError(null);
      const changed = lastStatus.current !== r.data.status;
      lastStatus.current = r.data.status;
      setJob(r.data);
      if (changed) router.refresh();
    }, POLL_MS);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [running, ws, job.id, router]);

  const status = IMPORT_STATUS[job.status];
  const showMapping = canWrite && (job.status === 'uploaded' || remapping);
  const staleCommit = commit.error?.code === 'conflict';

  return (
    <div className="flex flex-col gap-6">
      <Panel className="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
        <div>
          <p className="flex items-center gap-2 text-[15px] font-semibold text-ink">
            <span data-testid="import-status">
              <Badge tone={status.tone}>{status.label}</Badge>
            </span>
            {job.mapping_version > 0 ? <span className="text-[12px] font-normal text-faint">mapping {job.mapping_version}</span> : null}
          </p>
          <p className="mt-1 text-[12.5px] text-muted">
            {formatCount(job.total_rows)} rows, uploaded <When at={job.created_at} />
            {job.finished_at ? (
              <>
                , finished <When at={job.finished_at} />
              </>
            ) : null}
          </p>
        </div>
        {canWrite && !terminal ? (
          <Button variant="ghost" onClick={() => setCancelling(true)}>
            Cancel import
          </Button>
        ) : null}
      </Panel>

      {running ? (
        <div role="status" aria-live="polite" className="flex flex-col gap-2" data-testid="import-progress">
          <p className="flex items-center gap-2 text-[13px] text-ink">
            <Spinner />
            {job.status === 'validating' ? 'Checking every row. Nothing is imported yet.' : 'Importing.'} {formatCount(job.processed_rows)} of {formatCount(job.total_rows)} rows.
          </p>
          <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
            <div className="gold-surface h-full border-0 transition-[width] duration-300 ease-[var(--ease-out)]" style={{ width: `${percent(job.processed_rows, job.total_rows)}%` }} />
          </div>
          <p className="text-[12px] text-faint">You can leave this page; the import keeps going and this page picks it up again.</p>
          {pollError ? <Notice tone="warn">{pollError}</Notice> : null}
        </div>
      ) : null}

      {job.status === 'failed' ? (
        <Notice tone="danger">
          The import failed: {(job.error ?? 'no reason given').replace(/\.+$/, '')}.{' '}
          {job.result && job.result.created + job.result.updated > 0
            ? `The ${formatCount(job.result.created + job.result.updated)} contacts written before it failed stay imported.`
            : 'Nothing was imported.'}
        </Notice>
      ) : null}
      {job.status === 'cancelled' ? (
        <Notice>
          Cancelled. {job.result ? `${formatCount(job.processed_rows)} rows were imported before the cancel and stay.` : 'Nothing was imported.'} This import is closed; upload the file again to start over.
        </Notice>
      ) : null}

      {showMapping ? (
        <MappingForm
          ws={ws}
          job={job}
          lookups={lookups}
          onCancel={job.status === 'uploaded' ? undefined : () => setRemapping(false)}
          onMapped={(j) => {
            setRemapping(false);
            commit.clearError();
            setJob(j);
            router.refresh();
          }}
        />
      ) : null}

      {job.status === 'validated' && job.dry_run && !remapping ? (
        <Section title="Dry run" description="What importing would do, row by row. Nothing has been written yet.">
          <Report report={job.dry_run} verb="would" />
          {staleCommit ? (
            <div className="mt-4">
              <Notice tone="warn">{commit.error!.message} The dry run below is the current one.</Notice>
            </div>
          ) : (
            <div className="mt-4">
              <FormError error={commit.error} />
            </div>
          )}
          {canWrite ? (
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Button
                variant="primary"
                busy={commit.pending}
                disabled={job.dry_run.created + job.dry_run.updated === 0}
                onClick={() =>
                  void commit.run(
                    () => commitImport(ws, job.id, job.mapping_version),
                    (j) => {
                      setJob(j);
                      router.refresh();
                    },
                  ).then((r) => {
                    if (!r.ok && r.error.code === 'conflict') router.refresh();
                  })
                }
              >
                Import {formatCount(job.dry_run.created + job.dry_run.updated)} contacts
              </Button>
              <Button onClick={() => setRemapping(true)} disabled={commit.pending}>
                Change the mapping
              </Button>
              {job.dry_run.created + job.dry_run.updated === 0 ? <span className="text-[12.5px] text-muted">Nothing to import: every row is already up to date or left out.</span> : null}
            </div>
          ) : null}
        </Section>
      ) : null}

      {job.result && (job.status === 'committing' || terminal) ? (
        <Section title={job.status === 'completed' ? 'Imported' : 'Written so far'}>
          <Report report={job.result} verb="did" />
        </Section>
      ) : null}

      {!running && !remapping && (job.status === 'validated' || terminal) && (job.dry_run || job.result) ? (
        <Section title="Rows">
          <Rows key={`${job.status}-${job.mapping_version}-${rows ? 'page' : 'none'}`} ws={ws} job={job} initial={rows} />
        </Section>
      ) : null}

      {job.status === 'uploaded' && !canWrite ? (
        <EmptyState title="Waiting for a mapping">Someone with editor access maps the columns and starts the dry run.</EmptyState>
      ) : null}

      <ConfirmDialog
        open={cancelling}
        onClose={() => setCancelling(false)}
        title="Cancel this import?"
        description={
          job.status === 'committing'
            ? 'The rows already imported stay; the rest is not imported. A cancelled import cannot be resumed.'
            : 'Nothing has been imported, and nothing will be. A cancelled import cannot be resumed; upload the file again to start over.'
        }
        confirmLabel="Cancel import"
        action={async () => {
          const r = await cancelImport(ws, job.id);
          if (r.ok) setJob(r.data);
          return r;
        }}
        onDone={() => router.refresh()}
      />
    </div>
  );
}
