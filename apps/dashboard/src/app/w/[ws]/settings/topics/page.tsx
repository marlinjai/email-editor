import type { Metadata } from 'next';
import { ErrorPanel } from '@/components/ui';
import { act } from '@/lib/action';
import { mail } from '@/lib/mail';
import { can } from '@/lib/roles';
import { workspaceContext } from '@/lib/workspace';
import { TopicsView } from './view';

export const metadata: Metadata = { title: 'Topics' };

export default async function TopicsPage({ params }: { params: Promise<{ ws: string }> }) {
  const { ws } = await params;
  const ctx = await workspaceContext(ws);
  const topics = await act('topics.list', async () => {
    const { api } = await mail(ws);
    const all = [];
    for await (const t of api.paginate('topics.list', { query: { limit: 100 } })) all.push(t);
    return all;
  });
  if (!topics.ok)
    return <ErrorPanel title="Topics could not be loaded" message={topics.error.message} requestId={topics.error.requestId} />;
  const role = ctx.ok && ctx.data ? ctx.data.role : 'viewer';
  const locales = ctx.ok && ctx.data ? ctx.data.workspace.settings.locales : [];
  const defaultLocale = ctx.ok && ctx.data ? ctx.data.workspace.settings.default_locale : 'en';
  return <TopicsView ws={ws} topics={topics.data} canAdmin={can(role, 'admin')} locales={locales} defaultLocale={defaultLocale} />;
}
