import type { Metadata } from 'next';
import { ErrorPanel } from '@/components/ui';
import { act } from '@/lib/action';
import { mail } from '@/lib/mail';
import { can } from '@/lib/roles';
import { workspaceContext } from '@/lib/workspace';
import { ProvidersView } from './view';

export const metadata: Metadata = { title: 'Providers' };

export default async function ProvidersPage({ params }: { params: Promise<{ ws: string }> }) {
  const { ws } = await params;
  const ctx = await workspaceContext(ws);
  const role = ctx.ok && ctx.data ? ctx.data.role : 'viewer';
  const providers = await act('providers.list', async () => {
    const { api } = await mail(ws);
    const list = [];
    for await (const p of api.paginate('providers.list', { query: { limit: 100 } })) list.push(p);
    // Usage per provider: a failure for one shows on its card, not the page.
    const usage = await Promise.all(list.map((p) => api.providers.usage(p.id).catch(() => null)));
    return list.map((p, i) => ({ provider: p, usage: usage[i] ?? null }));
  });
  if (!providers.ok)
    return <ErrorPanel title="Providers could not be loaded" message={providers.error.message} requestId={providers.error.requestId} />;
  return <ProvidersView ws={ws} items={providers.data} canAdmin={can(role, 'admin')} />;
}
