import type { Metadata } from 'next';
import { ErrorPanel, LinkButton, PageHeader } from '@/components/ui';
import { act } from '@/lib/action';
import { mail } from '@/lib/mail';
import { can } from '@/lib/roles';
import { workspaceContext } from '@/lib/workspace';
import { HistoryView } from './view';

export const metadata: Metadata = { title: 'Template history' };

export default async function HistoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ ws: string; id: string }>;
  searchParams: Promise<{ cursor?: string }>;
}) {
  const { ws, id } = await params;
  const { cursor } = await searchParams;
  const ctx = await workspaceContext(ws);
  const role = ctx.ok && ctx.data ? ctx.data.role : 'viewer';
  const data = await act('templates.versions', async () => {
    const { api } = await mail(ws);
    const [template, versions] = await Promise.all([api.templates.get(id), api.templates.versions(id, { limit: 50, cursor })]);
    return { template, versions };
  });
  if (!data.ok) return <ErrorPanel title="The history could not be loaded" message={data.error.message} requestId={data.error.requestId} />;
  const { template, versions } = data.data;
  return (
    <>
      <PageHeader
        title={`History of ${template.name}`}
        description="Every saved version. Restoring one saves it again as the newest version, so nothing is ever overwritten."
        actions={<LinkButton href={`/w/${ws}/templates/${id}`}>Back to the editor</LinkButton>}
      />
      <HistoryView
        ws={ws}
        templateId={id}
        currentVersion={template.version}
        versions={versions.data.map((v) => ({ version: v.version, createdBy: v.created_by, createdAt: v.created_at }))}
        nextCursor={versions.next_cursor}
        canWrite={can(role, 'write')}
      />
    </>
  );
}
