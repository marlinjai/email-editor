import Link from 'next/link';
import type { Metadata } from 'next';
import { MAILING_STATUSES, type MailingStatus } from '@marlinjai/mail-sdk';
import { Badge, EmptyState, ErrorPanel, LinkButton, PageHeader, Table, Td, Th, When } from '@/components/ui';
import { act } from '@/lib/action';
import { formatCount } from '@/lib/format';
import { mail } from '@/lib/mail';
import { MAILING_STATUS_LABEL, mailingProgress } from '@/lib/mailing-status';
import { can } from '@/lib/roles';
import { workspaceContext } from '@/lib/workspace';

export const metadata: Metadata = { title: 'Mailings' };

export default async function MailingsPage({ params, searchParams }: { params: Promise<{ ws: string }>; searchParams: Promise<{ status?: string; cursor?: string }> }) {
  const { ws } = await params;
  const sp = await searchParams;
  const status = MAILING_STATUSES.includes(sp.status as MailingStatus) ? (sp.status as MailingStatus) : undefined;
  const ctx = await workspaceContext(ws);
  const role = ctx.ok && ctx.data ? ctx.data.role : 'viewer';
  const list = await act('mailings.list', async () => (await mail(ws)).api.mailings.list({ status, limit: 50, cursor: sp.cursor }));
  const base = `/w/${ws}/mailings`;
  const filters: Array<MailingStatus | null> = [null, 'draft', 'sending', 'paused', 'sent', 'partially_failed', 'cancelled'];

  return (
    <>
      <PageHeader
        title="Mailings"
        description="Each mailing is one send of one email to a list of recipients, under one topic, through one provider."
        actions={can(role, 'write') ? <LinkButton href={`${base}/new`} variant="primary">New mailing</LinkButton> : null}
      />
      <nav aria-label="Filter by status" className="mb-4 flex flex-wrap gap-1">
        {filters.map((s) => (
          <LinkButton key={s ?? 'all'} href={s ? `${base}?status=${s}` : base} variant={status === (s ?? undefined) ? 'secondary' : 'ghost'} aria-current={status === (s ?? undefined) ? 'page' : undefined}>
            {s ? MAILING_STATUS_LABEL[s].label : 'All'}
          </LinkButton>
        ))}
      </nav>
      {!list.ok ? (
        <ErrorPanel title="Mailings could not be loaded" message={list.error.message} requestId={list.error.requestId} />
      ) : list.data.data.length === 0 ? (
        <EmptyState
          title={status ? `No ${MAILING_STATUS_LABEL[status].label.toLowerCase()} mailings` : 'No mailings yet'}
          action={can(role, 'write') && !status ? <LinkButton href={`${base}/new`} variant="primary">New mailing</LinkButton> : null}
        >
          {status ? 'Try another filter.' : 'Start from a template, add recipients, send yourself a test, then send it.'}
        </EmptyState>
      ) : (
        <>
          <Table label="Mailings">
            <thead>
              <tr>
                <Th>Mailing</Th>
                <Th>Status</Th>
                <Th className="text-right">Sent</Th>
                <Th className="text-right">Failed</Th>
                <Th className="text-right">Skipped</Th>
                <Th>Last activity</Th>
              </tr>
            </thead>
            <tbody>
              {list.data.data.map((m) => {
                const s = MAILING_STATUS_LABEL[m.status];
                const p = mailingProgress(m.counts);
                return (
                  <tr key={m.id}>
                    <Td>
                      <Link href={`${base}/${m.id}`} className="font-medium text-ink hover:text-gold">
                        {m.name ?? m.subject}
                      </Link>
                      {m.name ? <span className="block max-w-[48ch] truncate text-[12px] text-muted">{m.subject}</span> : null}
                    </Td>
                    <Td>
                      <Badge tone={s.tone}>{s.label}</Badge>
                    </Td>
                    <Td className="tabular text-right">
                      {formatCount(m.counts.sent)}
                      <span className="text-faint"> / {formatCount(p.total)}</span>
                    </Td>
                    <Td className={`tabular text-right ${m.counts.failed > 0 ? 'text-danger' : 'text-muted'}`}>{formatCount(m.counts.failed)}</Td>
                    <Td className="tabular text-right text-muted">{formatCount(m.counts.skipped)}</Td>
                    <Td>
                      <When at={m.finished_at ?? m.started_at ?? m.updated_at} />
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
          {list.data.next_cursor ? (
            <div className="mt-3 flex justify-end">
              <LinkButton href={`${base}?${new URLSearchParams({ ...(status ? { status } : {}), cursor: list.data.next_cursor })}`}>Older mailings</LinkButton>
            </div>
          ) : null}
        </>
      )}
    </>
  );
}
