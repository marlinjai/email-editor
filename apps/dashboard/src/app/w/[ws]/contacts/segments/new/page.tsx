import Link from 'next/link';
import type { Metadata } from 'next';
import { ErrorPanel, PageHeader } from '@/components/ui';
import { SegmentBuilder } from '../builder';
import { can } from '@/lib/roles';
import { workspaceContext } from '@/lib/workspace';
import { segmentLookups } from '../lookups';

export const metadata: Metadata = { title: 'New segment' };

export default async function NewSegmentPage({ params }: { params: Promise<{ ws: string }> }) {
  const { ws } = await params;
  const [ctx, lookups] = await Promise.all([workspaceContext(ws), segmentLookups(ws)]);
  const role = ctx.ok && ctx.data ? ctx.data.role : 'viewer';
  return (
    <>
      <div className="mb-2">
        <Link href={`/w/${ws}/contacts/segments`} className="text-[12.5px] text-muted hover:text-ink">
          ← Segments
        </Link>
      </div>
      <PageHeader title="New segment" />
      {lookups.ok ? (
        <SegmentBuilder ws={ws} segment={null} lookups={lookups.data} canWrite={can(role, 'write')} />
      ) : (
        <ErrorPanel title="The builder could not be loaded" message={lookups.error.message} requestId={lookups.error.requestId} />
      )}
    </>
  );
}
