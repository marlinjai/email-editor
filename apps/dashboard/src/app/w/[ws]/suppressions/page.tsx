import { SUPPRESSION_REASONS, type SuppressionReason } from '@marlinjai/mail-contract';
import type { Metadata } from 'next';
import { ErrorPanel, PageHeader } from '@/components/ui';
import { act } from '@/lib/action';
import { mail } from '@/lib/mail';
import { can } from '@/lib/roles';
import { workspaceContext } from '@/lib/workspace';
import { SuppressionsView } from './view';

export const metadata: Metadata = { title: 'Suppressions' };

export default async function SuppressionsPage({ params, searchParams }: { params: Promise<{ ws: string }>; searchParams: Promise<{ q?: string; reason?: string; cursor?: string }> }) {
  const { ws } = await params;
  const sp = await searchParams;
  const ctx = await workspaceContext(ws);
  const role = ctx.ok && ctx.data ? ctx.data.role : 'viewer';
  const q = sp.q?.trim() || undefined;
  const reason = (SUPPRESSION_REASONS as readonly string[]).includes(sp.reason ?? '') ? (sp.reason as SuppressionReason) : undefined;
  const [list, topics] = await Promise.all([
    act('suppressions.list', async () => (await mail(ws)).api.suppressions.list({ email: q, reason, limit: 50, cursor: sp.cursor })),
    act('topics.list', async () => (await (await mail(ws)).api.topics.list({ limit: 100 })).data),
  ]);
  return (
    <>
      <PageHeader
        title="Suppressions"
        description="Addresses that are never mailed, whatever a list says: unsubscribes, bounces, complaints and manual blocks. Erasing a contact keeps these."
      />
      {!list.ok ? (
        <ErrorPanel title="Suppressions could not be loaded" message={list.error.message} requestId={list.error.requestId} />
      ) : (
        <SuppressionsView
          ws={ws}
          items={list.data.data}
          nextCursor={list.data.next_cursor}
          query={q ?? ''}
          reason={reason ?? null}
          topics={topics.ok ? topics.data.map((t) => ({ slug: t.slug, name: t.name })) : []}
          canWrite={can(role, 'write')}
          canAdmin={can(role, 'admin')}
        />
      )}
    </>
  );
}
