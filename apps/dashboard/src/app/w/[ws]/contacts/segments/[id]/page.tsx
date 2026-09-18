import Link from 'next/link';
import type { Metadata } from 'next';
import { ErrorPanel, LinkButton, PageHeader } from '@/components/ui';
import { act } from '@/lib/action';
import { mail } from '@/lib/mail';
import { can } from '@/lib/roles';
import { workspaceContext } from '@/lib/workspace';
import { SegmentBuilder } from '../builder';
import { segmentLookups } from '../lookups';

export const metadata: Metadata = { title: 'Segment' };

export default async function SegmentPage({ params }: { params: Promise<{ ws: string; id: string }> }) {
  const { ws, id } = await params;
  const ctx = await workspaceContext(ws);
  const role = ctx.ok && ctx.data ? ctx.data.role : 'viewer';
  const [segment, lookups] = await Promise.all([act('segments.get', async () => (await mail(ws)).api.segments.get(id)), segmentLookups(ws)]);
  const back = `/w/${ws}/contacts/segments`;
  if (!segment.ok) {
    return (
      <ErrorPanel
        title="This segment could not be opened"
        message={segment.error.message}
        requestId={segment.error.requestId}
        action={<LinkButton href={back}>Back to segments</LinkButton>}
      />
    );
  }
  return (
    <>
      <div className="mb-2">
        <Link href={back} className="text-[12.5px] text-muted hover:text-ink">
          ← Segments
        </Link>
      </div>
      <PageHeader title={segment.data.name} />
      {lookups.ok ? (
        <SegmentBuilder key={segment.data.updated_at} ws={ws} segment={segment.data} lookups={lookups.data} canWrite={can(role, 'write')} />
      ) : (
        <ErrorPanel title="The builder could not be loaded" message={lookups.error.message} requestId={lookups.error.requestId} />
      )}
    </>
  );
}
