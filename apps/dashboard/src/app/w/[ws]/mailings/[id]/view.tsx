'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { CompileResult, Mailing, MessageSummary, Page, Provider, Recipient, RecipientStatus, TemplateSummary, Topic } from '@marlinjai/mail-contract';
import { CompileMessages, EmailPreview } from '@/components/email-preview';
import { FormError } from '@/components/form-error';
import { Badge, Button, EmptyState, ErrorPanel, LinkButton, Mono, Notice, PageHeader, Section, Select, Table, Td, Th, When } from '@/components/ui';
import { useAction } from '@/components/use-action';
import { MAILING_STATUS_LABEL, mailingControls } from '@/lib/mailing-status';
import type { ActionResult } from '@/lib/result';
import { getMailing, refreshFromTemplate } from '../actions';
import { MailingContentForm } from '../content-form';
import { AddRecipients, Controls, ProgressRail, TestSend } from './parts';

/** How often a live mailing asks for fresh counts. */
const POLL_MS = 2500;

const RECIPIENT_TONE: Record<RecipientStatus, 'neutral' | 'gold' | 'ok' | 'danger'> = { queued: 'neutral', sending: 'gold', sent: 'ok', failed: 'danger', skipped: 'neutral' };
const SKIP_LABEL: Record<string, string> = {
  suppressed: 'suppressed',
  not_subscribed: 'not subscribed to the topic',
  contact_erased: 'contact erased',
  cancelled: 'mailing cancelled',
  outcome_unknown: 'outcome unknown',
};

function RefreshFromTemplate({ ws, mailing, templates, onDone }: { ws: string; mailing: Mailing; templates: TemplateSummary[]; onDone: (m: Mailing) => void }) {
  const { run, pending, error } = useAction();
  const [templateId, setTemplateId] = useState(mailing.template_id && templates.some((t) => t.id === mailing.template_id) ? mailing.template_id : (templates[0]?.id ?? ''));
  if (templates.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1.5 text-[12.5px] font-medium text-muted">
          Take the content from
          <Select value={templateId} onChange={(e) => setTemplateId(e.target.value)} className="w-72">
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} (v{t.version})
              </option>
            ))}
          </Select>
        </label>
        <Button busy={pending} onClick={() => void run(() => refreshFromTemplate(ws, mailing.id, templateId), onDone)}>
          Use its current version
        </Button>
      </div>
      <FormError error={error} />
    </div>
  );
}

export function MailingView({
  ws,
  initial,
  canWrite,
  viewerEmail,
  lookups,
  recipients,
  recipientFilter,
  compiled,
  lastTest,
  outcomeUnknown,
}: {
  ws: string;
  initial: Mailing;
  canWrite: boolean;
  viewerEmail: string;
  lookups: ActionResult<{ topics: Topic[]; providers: Provider[]; templates: TemplateSummary[] }>;
  recipients: ActionResult<Page<Recipient>>;
  recipientFilter: RecipientStatus | null;
  compiled: ActionResult<CompileResult>;
  lastTest: MessageSummary | null;
  outcomeUnknown: number;
}) {
  const router = useRouter();
  const [mailing, setMailing] = useState(initial);
  const [pollError, setPollError] = useState<string | null>(null);
  useEffect(() => setMailing(initial), [initial]);
  const controls = mailingControls(mailing.status);
  const status = MAILING_STATUS_LABEL[mailing.status];
  const base = `/w/${ws}/mailings/${mailing.id}`;

  // Live counts while the worker can still move them. A reload of the page
  // resumes this from the service's state; nothing is kept in the browser.
  useEffect(() => {
    if (!controls.live) return;
    let stopped = false;
    const timer = setInterval(async () => {
      const r = await getMailing(ws, mailing.id).catch(() => null);
      if (stopped) return;
      if (!r || !r.ok) {
        setPollError(r ? r.error.message : 'The dashboard did not answer.');
        return;
      }
      setPollError(null);
      setMailing((prev) => {
        // A status change reloads the rest of the page (recipients, controls).
        if (prev.status !== r.data.status) router.refresh();
        return r.data;
      });
    }, POLL_MS);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [controls.live, ws, mailing.id, router]);

  const onChange = (m: Mailing) => {
    setMailing(m);
    router.refresh();
  };

  return (
    <>
      <div className="mb-2">
        <Link href={`/w/${ws}/mailings`} className="text-[12.5px] text-muted hover:text-ink">
          ← All mailings
        </Link>
      </div>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            {mailing.name ?? mailing.subject}
            <Badge tone={status.tone}>
              <span data-testid="mailing-status">{status.label}</span>
            </Badge>
          </span>
        }
        description={
          <>
            {/* The title is the subject when there is no internal name; do not say it twice. */}
            {mailing.name ? <span className="text-ink">{mailing.subject}</span> : null}
            {mailing.preheader ? <span className="text-muted">{mailing.name ? ' · ' : ''}{mailing.preheader}</span> : null}
            <span className="mt-1 block text-[12.5px] text-faint">
              Topic <Mono>{mailing.topic}</Mono>. Created <When at={mailing.created_at} />
              {mailing.started_at ? (
                <>
                  , started <When at={mailing.started_at} />
                </>
              ) : null}
              {mailing.finished_at ? (
                <>
                  , finished <When at={mailing.finished_at} />
                </>
              ) : null}
              .
            </span>
          </>
        }
        actions={canWrite ? <Controls ws={ws} mailing={mailing} allowed={controls} outcomeUnknown={outcomeUnknown} onChange={onChange} /> : null}
      />

      {mailing.status !== 'draft' || mailing.counts.total > 0 ? (
        <section className="mb-6 rounded-xl border border-line bg-panel p-5" aria-label="Progress">
          <ProgressRail counts={mailing.counts} live={controls.live} />
          {pollError ? <p role="alert" className="mt-2 text-[12.5px] text-warn">Live updates paused: {pollError} Retrying.</p> : null}
          {mailing.status === 'paused' && mailing.pause_reason ? (
            <div className="mt-3">
              <Notice tone="danger">
                <span className="font-medium">Paused by the service, not by a person.</span>
                <span className="mt-1 block text-[12.5px]">{mailing.pause_reason}</span>
              </Notice>
            </div>
          ) : null}
          {mailing.status === 'partially_failed' ? (
            <div className="mt-3">
              <Notice tone="danger">Some recipients failed. Look at their errors below, then retry them once the cause is fixed.</Notice>
            </div>
          ) : null}
          {mailing.status === 'cancelled' ? (
            <div className="mt-3">
              <Notice>This mailing was cancelled and is read-only. Duplicate it to send the same email again.</Notice>
            </div>
          ) : null}
        </section>
      ) : null}

      <Section title="Details" description={controls.editable ? 'Editable until the mailing is sent.' : 'Fixed once the mailing was sent.'}>
        {!lookups.ok ? (
          <ErrorPanel title="Topics and providers could not be loaded" message={lookups.error.message} requestId={lookups.error.requestId} />
        ) : (
          <MailingContentForm
            key={mailing.updated_at}
            ws={ws}
            mode={{ kind: 'edit', mailingId: mailing.id }}
            topics={lookups.data.topics.map((t) => ({ slug: t.slug, name: t.name }))}
            providers={lookups.data.providers.map((p) => ({ id: p.id, name: p.name, from: `${p.from_name} <${p.from_email}>` }))}
            initial={{ name: mailing.name ?? '', subject: mailing.subject, preheader: mailing.preheader ?? '', topic: mailing.topic, providerId: mailing.provider_id }}
            disabled={!canWrite || !controls.editable}
          />
        )}
      </Section>

      <Section
        title="Content"
        description="A copy of the template taken when the mailing was created, so later edits to the template do not change it."
        actions={mailing.template_id ? <LinkButton href={`/w/${ws}/templates/${mailing.template_id}`} variant="ghost">Open the template</LinkButton> : null}
      >
        {canWrite && controls.editable && lookups.ok ? (
          <div className="mb-4">
            <RefreshFromTemplate ws={ws} mailing={mailing} templates={lookups.data.templates} onDone={onChange} />
          </div>
        ) : null}
        {compiled.ok ? (
          <div className="flex flex-col gap-3">
            <CompileMessages errors={compiled.data.errors} warnings={compiled.data.warnings} />
            <EmailPreview key={mailing.updated_at} html={compiled.data.html} title={`Preview of ${mailing.subject}`} />
          </div>
        ) : (
          <ErrorPanel title="The preview could not be built" message={compiled.error.message} requestId={compiled.error.requestId} />
        )}
      </Section>

      <Section title="Test">
        <TestSend ws={ws} mailing={mailing} lastTest={lastTest} defaultTo={viewerEmail} canWrite={canWrite} />
      </Section>

      {canWrite && controls.editable ? (
        <Section title="Add recipients" description="Each address becomes a contact in this workspace if it is not one yet. Adding the same address twice does nothing.">
          <AddRecipients ws={ws} mailingId={mailing.id} />
        </Section>
      ) : null}

      <Section
        title="Recipients"
        actions={
          <nav aria-label="Filter recipients" className="flex flex-wrap gap-1">
            {([null, 'queued', 'sent', 'failed', 'skipped'] as const).map((s) => (
              <LinkButton key={s ?? 'all'} href={s ? `${base}?rstatus=${s}` : base} scroll={false} variant={recipientFilter === s ? 'secondary' : 'ghost'} aria-current={recipientFilter === s ? 'page' : undefined}>
                {s ? s[0]!.toUpperCase() + s.slice(1) : 'All'}
              </LinkButton>
            ))}
          </nav>
        }
      >
        {!recipients.ok ? (
          <ErrorPanel title="Recipients could not be loaded" message={recipients.error.message} requestId={recipients.error.requestId} />
        ) : recipients.data.data.length === 0 ? (
          <EmptyState title={recipientFilter ? `No ${recipientFilter} recipients` : 'No recipients yet'}>
            {recipientFilter ? 'Try another filter.' : controls.editable ? 'Paste addresses or upload a CSV above.' : 'This mailing had no recipients.'}
          </EmptyState>
        ) : (
          <>
            <Table label="Recipients">
              <thead>
                <tr>
                  <Th>Address</Th>
                  <Th>Status</Th>
                  <Th className="text-right">Attempts</Th>
                  <Th>Detail</Th>
                </tr>
              </thead>
              <tbody>
                {recipients.data.data.map((r) => (
                  <tr key={r.id}>
                    <Td>
                      <span className="text-ink">{r.email}</span>
                      {typeof r.merge.first_name === 'string' ? <span className="block text-[12px] text-muted">{r.merge.first_name}</span> : null}
                    </Td>
                    <Td>
                      <Badge tone={RECIPIENT_TONE[r.status]}>{r.status}</Badge>
                    </Td>
                    <Td className="tabular text-right text-muted">{r.attempts}</Td>
                    <Td className="max-w-[44ch]">
                      {r.skip_reason ? <span className="text-muted">{SKIP_LABEL[r.skip_reason] ?? r.skip_reason}</span> : null}
                      {/* An error is shown only while it still describes the recipient: a retried, sent one no longer failed. */}
                      {r.last_error && r.status !== 'sent' ? <span className="block truncate text-[12px] text-danger" title={r.last_error}>{r.last_error}</span> : null}
                      {r.message_id ? (
                        <Link href={`/w/${ws}/archive/${r.message_id}`} className="text-[12.5px] text-muted underline decoration-line-strong hover:text-ink">
                          View sent message
                        </Link>
                      ) : null}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            {recipients.data.next_cursor ? (
              <div className="mt-3 flex justify-end">
                <LinkButton scroll={false} href={`${base}?${new URLSearchParams({ ...(recipientFilter ? { rstatus: recipientFilter } : {}), rcursor: recipients.data.next_cursor })}`}>
                  More recipients
                </LinkButton>
              </div>
            ) : null}
          </>
        )}
      </Section>
    </>
  );
}
