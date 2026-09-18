import Link from 'next/link';
import type { Metadata } from 'next';
import { Badge, EmptyState, ErrorPanel, LinkButton, PageHeader, Panel, Section, When } from '@/components/ui';
import { act } from '@/lib/action';
import { formatCount } from '@/lib/format';
import { mail } from '@/lib/mail';
import { MAILING_STATUS_LABEL, mailingProgress } from '@/lib/mailing-status';
import { can } from '@/lib/roles';
import { workspaceContext } from '@/lib/workspace';

export const metadata: Metadata = { title: 'Overview' };

/**
 * What a person opening the workspace needs first: what is sending right now,
 * what was sent lately, and what is still missing before anything can be sent.
 */
export default async function Overview({ params }: { params: Promise<{ ws: string }> }) {
  const { ws } = await params;
  const ctx = await workspaceContext(ws);
  const role = ctx.ok && ctx.data ? ctx.data.role : 'viewer';
  const data = await act('overview', async () => {
    const { api } = await mail(ws);
    const [mailings, providers, topics, templates] = await Promise.all([
      api.mailings.list({ limit: 8 }),
      api.providers.list({ limit: 1 }),
      api.topics.list({ limit: 1 }),
      api.templates.list({ limit: 1 }),
    ]);
    return { mailings: mailings.data, hasProvider: providers.data.length > 0, hasTopic: topics.data.length > 0, hasTemplate: templates.data.length > 0 };
  });
  const base = `/w/${ws}`;

  return (
    <>
      <PageHeader
        title={ctx.ok && ctx.data ? ctx.data.workspace.name : 'Overview'}
        description="Mailings in progress and the latest sends."
        actions={can(role, 'write') ? <LinkButton href={`${base}/mailings/new`} variant="primary">New mailing</LinkButton> : null}
      />
      {!data.ok ? (
        <ErrorPanel message={data.error.message} requestId={data.error.requestId} />
      ) : (
        <>
          {!data.data.hasProvider || !data.data.hasTopic || !data.data.hasTemplate ? (
            <Section title="Before the first mailing" description="A mailing needs a sending provider, a topic people can unsubscribe from, and a template.">
              <ol className="flex flex-col gap-2">
                {[
                  { done: data.data.hasProvider, label: 'Connect a sending provider', href: `${base}/settings/providers` },
                  { done: data.data.hasTopic, label: 'Create a topic', href: `${base}/settings/topics` },
                  { done: data.data.hasTemplate, label: 'Design a template', href: `${base}/templates` },
                ].map((step) => (
                  <li key={step.label} className="flex items-center gap-3 text-[13.5px]">
                    <Badge tone={step.done ? 'ok' : 'neutral'}>{step.done ? 'Done' : 'To do'}</Badge>
                    {step.done ? <span className="text-muted">{step.label}</span> : <Link href={step.href} className="text-ink underline decoration-line-strong hover:decoration-gold">{step.label}</Link>}
                  </li>
                ))}
              </ol>
            </Section>
          ) : null}
          <Section title="Recent mailings" actions={<LinkButton href={`${base}/mailings`} variant="ghost">All mailings</LinkButton>}>
            {data.data.mailings.length === 0 ? (
              <EmptyState title="No mailings yet">Create a mailing from a template, add recipients, send yourself a test, then send it.</EmptyState>
            ) : (
              <Panel>
                <ul>
                  {data.data.mailings.map((m) => {
                    const p = mailingProgress(m.counts);
                    const s = MAILING_STATUS_LABEL[m.status];
                    return (
                      <li key={m.id} className="border-b border-line last:border-b-0">
                        <Link href={`${base}/mailings/${m.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 hover:bg-white/[0.03]">
                          <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium text-ink">{m.name ?? m.subject}</span>
                          <Badge tone={s.tone}>{s.label}</Badge>
                          <span className="tabular w-36 text-right text-[12.5px] text-muted">
                            {formatCount(m.counts.sent)} sent of {formatCount(p.total)}
                          </span>
                          <span className="w-40 text-right text-[12.5px]"><When at={m.finished_at ?? m.started_at ?? m.created_at} /></span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </Panel>
            )}
          </Section>
        </>
      )}
    </>
  );
}
