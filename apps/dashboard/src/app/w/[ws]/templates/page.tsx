import type { Metadata } from 'next';
import { ErrorPanel, PageHeader } from '@/components/ui';
import { act } from '@/lib/action';
import { mail } from '@/lib/mail';
import { can } from '@/lib/roles';
import { workspaceContext } from '@/lib/workspace';
import { TemplatesView } from './view';

export const metadata: Metadata = { title: 'Templates' };

export default async function TemplatesPage({
  params,
  searchParams,
}: {
  params: Promise<{ ws: string }>;
  searchParams: Promise<{ archived?: string; cursor?: string }>;
}) {
  const { ws } = await params;
  const sp = await searchParams;
  const archived = sp.archived === 'true';
  const ctx = await workspaceContext(ws);
  const role = ctx.ok && ctx.data ? ctx.data.role : 'viewer';
  const list = await act('templates.list', async () =>
    (await mail(ws)).api.templates.list({ archived: archived ? 'true' : 'false', limit: 50, cursor: sp.cursor }),
  );
  return (
    <>
      <PageHeader
        title="Templates"
        description="Reusable designs. A mailing takes a snapshot of a template, so editing one never changes mail already on its way."
      />
      {!list.ok ? (
        <ErrorPanel title="Templates could not be loaded" message={list.error.message} requestId={list.error.requestId} />
      ) : (
        <TemplatesView
          ws={ws}
          templates={list.data.data}
          nextCursor={list.data.next_cursor}
          archived={archived}
          canWrite={can(role, 'write')}
        />
      )}
    </>
  );
}
