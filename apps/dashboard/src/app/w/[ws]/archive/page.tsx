import Link from 'next/link';
import type { Metadata } from 'next';
import { Badge, EmptyState, ErrorPanel, LinkButton, PageHeader, Table, Td, Th, When } from '@/components/ui';
import { act } from '@/lib/action';
import { mail } from '@/lib/mail';

export const metadata: Metadata = { title: 'Sent archive' };

export default async function ArchivePage({ params, searchParams }: { params: Promise<{ ws: string }>; searchParams: Promise<{ outcome?: string; mailing?: string; cursor?: string }> }) {
  const { ws } = await params;
  const sp = await searchParams;
  const outcome = sp.outcome === 'sent' || sp.outcome === 'failed' ? sp.outcome : undefined;
  const list = await act('messages.list', async () => (await mail(ws)).api.messages.list({ outcome, mailing_id: sp.mailing, limit: 50, cursor: sp.cursor }));
  const base = `/w/${ws}/archive`;
  const qs = (extra: Record<string, string>) => `?${new URLSearchParams({ ...(sp.mailing ? { mailing: sp.mailing } : {}), ...extra })}`;
  return (
    <>
      <PageHeader title="Sent archive" description="Every message as it was sent, with the provider's answer. Tests are included and marked." />
      <nav aria-label="Filter by outcome" className="mb-4 flex flex-wrap gap-1">
        {([undefined, 'sent', 'failed'] as const).map((o) => (
          <LinkButton key={o ?? 'all'} href={`${base}${qs(o ? { outcome: o } : {})}`} variant={outcome === o ? 'secondary' : 'ghost'} aria-current={outcome === o ? 'page' : undefined}>
            {o === 'sent' ? 'Sent' : o === 'failed' ? 'Failed' : 'All'}
          </LinkButton>
        ))}
        {sp.mailing ? (
          <LinkButton href={base} variant="ghost">
            Clear mailing filter
          </LinkButton>
        ) : null}
      </nav>
      {!list.ok ? (
        <ErrorPanel title="The archive could not be loaded" message={list.error.message} requestId={list.error.requestId} />
      ) : list.data.data.length === 0 ? (
        <EmptyState title="Nothing sent yet">Messages appear here the moment the worker sends them, test sends included.</EmptyState>
      ) : (
        <>
          <Table label="Sent messages">
            <thead>
              <tr>
                <Th>To</Th>
                <Th>Subject</Th>
                <Th>Outcome</Th>
                <Th>Sent</Th>
              </tr>
            </thead>
            <tbody>
              {list.data.data.map((m) => (
                <tr key={m.id}>
                  <Td>
                    <Link href={`${base}/${m.id}`} className="text-ink hover:text-gold">
                      {m.to}
                    </Link>
                  </Td>
                  <Td className="max-w-[40ch] truncate text-muted">{m.subject}</Td>
                  <Td>
                    <span className="flex flex-wrap gap-1">
                      <Badge tone={m.outcome === 'sent' ? 'ok' : 'danger'}>{m.outcome}</Badge>
                      {m.is_test ? <Badge tone="gold">test</Badge> : null}
                    </span>
                  </Td>
                  <Td>
                    <When at={m.created_at} />
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
          {list.data.next_cursor ? (
            <div className="mt-3 flex justify-end">
              <LinkButton href={`${base}${qs({ ...(outcome ? { outcome } : {}), cursor: list.data.next_cursor })}`}>Older messages</LinkButton>
            </div>
          ) : null}
        </>
      )}
    </>
  );
}
