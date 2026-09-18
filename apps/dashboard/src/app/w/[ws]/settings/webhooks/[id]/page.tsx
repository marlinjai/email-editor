import type { Metadata } from 'next';
import { WEBHOOK_DELIVERY_STATUSES, type WebhookDeliveryStatus } from '@marlinjai/mail-sdk';
import { ErrorPanel } from '@/components/ui';
import { act } from '@/lib/action';
import { mail } from '@/lib/mail';
import { EndpointView } from './view';

export const metadata: Metadata = { title: 'Webhook endpoint' };

export default async function EndpointPage({
  params,
  searchParams,
}: {
  params: Promise<{ ws: string; id: string }>;
  searchParams: Promise<{ status?: string; cursor?: string }>;
}) {
  const { ws, id } = await params;
  const sp = await searchParams;
  const status = WEBHOOK_DELIVERY_STATUSES.includes(sp.status as WebhookDeliveryStatus) ? (sp.status as WebhookDeliveryStatus) : undefined;
  const data = await act('webhooks.get', async () => {
    const { api } = await mail(ws);
    const [endpoint, deliveries] = await Promise.all([
      api.webhooks.get(id),
      api.webhooks.deliveries(id, { limit: 50, status, cursor: sp.cursor }),
    ]);
    return { endpoint, deliveries };
  });
  if (!data.ok)
    return <ErrorPanel title="This endpoint could not be loaded" message={data.error.message} requestId={data.error.requestId} />;
  return (
    <EndpointView
      ws={ws}
      endpoint={data.data.endpoint}
      deliveries={data.data.deliveries.data}
      nextCursor={data.data.deliveries.next_cursor}
      status={status ?? null}
    />
  );
}
