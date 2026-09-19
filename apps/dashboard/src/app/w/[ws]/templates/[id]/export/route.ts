import { exportClient, exportFileResponse, versionParam } from '@/lib/export-file';

export const dynamic = 'force-dynamic';

/**
 * `GET /w/<ws>/templates/<id>/export?format=mjml|html&version=<n>`: the
 * template as a file, fetched from the mail service server-side as the
 * signed-in person (who needs read access to the workspace).
 */
export async function GET(req: Request, { params }: { params: Promise<{ ws: string; id: string }> }) {
  const { ws, id } = await params;
  const search = new URL(req.url).searchParams;
  const version = versionParam(search.get('version'));
  if (!version.ok) return Response.json({ error: { code: 'validation_failed', message: 'The version must be a positive whole number.' } }, { status: 400 });
  const client = await exportClient(ws);
  if ('response' in client) return client.response;
  return exportFileResponse(search.get('format'), (format) => client.api.templates.export(id, { format, version: version.version }));
}
