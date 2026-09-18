import type { Metadata } from 'next';
import { ErrorPanel } from '@/components/ui';
import { act } from '@/lib/action';
import { mail } from '@/lib/mail';
import { ApiKeysView } from './view';

export const metadata: Metadata = { title: 'API keys' };

export default async function ApiKeysPage({ params }: { params: Promise<{ ws: string }> }) {
  const { ws } = await params;
  const keys = await act('apiKeys.list', async () => {
    const { api } = await mail(ws);
    const all = [];
    for await (const k of api.paginate('apiKeys.list', { query: { limit: 100 } })) all.push(k);
    return all;
  });
  if (!keys.ok) return <ErrorPanel title="API keys could not be loaded" message={keys.error.message} requestId={keys.error.requestId} />;
  return <ApiKeysView ws={ws} keys={keys.data} />;
}
