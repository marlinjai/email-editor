import type { Metadata } from 'next';
import { ErrorPanel } from '@/components/ui';
import { act } from '@/lib/action';
import { mail } from '@/lib/mail';
import { can } from '@/lib/roles';
import { workspaceContext } from '@/lib/workspace';
import { TagsView } from './view';

export const metadata: Metadata = { title: 'Tags' };

export default async function TagsPage({ params }: { params: Promise<{ ws: string }> }) {
  const { ws } = await params;
  const ctx = await workspaceContext(ws);
  const role = ctx.ok && ctx.data ? ctx.data.role : 'viewer';
  const tags = await act('tags.list', async () => {
    const { api } = await mail(ws);
    const all = [];
    for await (const t of api.paginate('tags.list', { query: { limit: 100 } })) all.push(t);
    return all;
  });
  if (!tags.ok) return <ErrorPanel title="Tags could not be loaded" message={tags.error.message} requestId={tags.error.requestId} />;
  return <TagsView ws={ws} tags={tags.data} canWrite={can(role, 'write')} />;
}
