import Link from 'next/link';
import type { Metadata } from 'next';
import { EmptyState, ErrorPanel, LinkButton, PageHeader, Table, Td, Th, When } from '@/components/ui';
import { act } from '@/lib/action';
import { formatCount } from '@/lib/format';
import { mail } from '@/lib/mail';
import { can } from '@/lib/roles';
import { workspaceContext } from '@/lib/workspace';

export const metadata: Metadata = { title: 'Segments' };

export default async function SegmentsPage({ params }: { params: Promise<{ ws: string }> }) {
  const { ws } = await params;
  const ctx = await workspaceContext(ws);
  const role = ctx.ok && ctx.data ? ctx.data.role : 'viewer';
  const segments = await act('segments.list', async () => {
    const { api } = await mail(ws);
    const all = [];
    for await (const s of api.paginate('segments.list', { query: { limit: 100 } })) all.push(s);
    return all;
  });
  const base = `/w/${ws}/contacts/segments`;
  return (
    <>
      <PageHeader
        title="Segments"
        description="Saved filters over contacts, by field, tag, topic, property or engagement. The count is of who matches now; a mailing takes its recipients from a segment when the segment is added to it."
        actions={can(role, 'write') ? <LinkButton href={`${base}/new`} variant="primary">New segment</LinkButton> : null}
      />
      {!segments.ok ? (
        <ErrorPanel title="Segments could not be loaded" message={segments.error.message} requestId={segments.error.requestId} />
      ) : segments.data.length === 0 ? (
        <EmptyState
          title="No segments yet"
          action={can(role, 'write') ? <LinkButton href={`${base}/new`}>Build a segment</LinkButton> : null}
        >
          A segment picks an audience, for example everyone tagged workshop who is subscribed to news.
        </EmptyState>
      ) : (
        <Table label="Segments">
          <thead>
            <tr>
              <Th>Segment</Th>
              <Th className="text-right">Contacts now</Th>
              <Th>Changed</Th>
            </tr>
          </thead>
          <tbody>
            {segments.data.map((s) => (
              <tr key={s.id}>
                <Td>
                  <Link href={`${base}/${s.id}`} className="text-ink hover:text-gold">
                    {s.name}
                  </Link>
                </Td>
                <Td className="tabular text-right">{formatCount(s.contact_count)}</Td>
                <Td>
                  <When at={s.updated_at} />
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </>
  );
}
