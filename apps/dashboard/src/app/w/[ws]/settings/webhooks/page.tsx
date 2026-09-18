import type { Metadata } from 'next';
import { ErrorPanel } from '@/components/ui';
import { act } from '@/lib/action';
import { mail } from '@/lib/mail';
import { WebhooksView } from './view';

export const metadata: Metadata = { title: 'Webhooks' };

export default async function WebhooksPage({ params }: { params: Promise<{ ws: string }> }) {
  const { ws } = await params;
  const endpoints = await act('webhooks.list', async () => {
    const { api } = await mail(ws);
    const all = [];
    for await (const e of api.paginate('webhooks.list', { query: { limit: 100 } })) all.push(e);
    return all;
  });
  if (!endpoints.ok)
    return <ErrorPanel title="Webhooks could not be loaded" message={endpoints.error.message} requestId={endpoints.error.requestId} />;
  return <WebhooksView ws={ws} endpoints={endpoints.data} />;
}
