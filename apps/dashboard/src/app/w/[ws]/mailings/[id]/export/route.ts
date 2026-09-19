import { exportClient, exportFileResponse } from '@/lib/export-file';

export const dynamic = 'force-dynamic';

/** `GET /w/<ws>/mailings/<id>/export?format=mjml|html`: the mailing's content snapshot as a file (see the template route). */
export async function GET(req: Request, { params }: { params: Promise<{ ws: string; id: string }> }) {
  const { ws, id } = await params;
  const client = await exportClient(ws);
  if ('response' in client) return client.response;
  return exportFileResponse(new URL(req.url).searchParams.get('format'), (format) => client.api.mailings.export(id, { format }));
}
