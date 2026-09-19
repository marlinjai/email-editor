import 'server-only';
import { unstable_rethrow } from 'next/navigation';
import { EXPORT_WARNINGS_HEADER, EXPORT_WARNING_COUNT_HEADER, ExportFormat, formatExportWarningsHeader, type ExportedFile } from '@marlinjai/mail-sdk';
import { describeError } from './errors';
import { mail } from './mail';
import { getViewer } from './viewer';

/** The signed-in person's client for `ws`, or the 401 answer when nobody is signed in (a fetch cannot follow a sign-in redirect). */
export async function exportClient(ws: string): Promise<{ api: Awaited<ReturnType<typeof mail>>['api'] } | { response: Response }> {
  if (!(await getViewer())) {
    return { response: Response.json({ error: { code: 'unauthenticated', message: 'Your session has ended. Sign in again to continue.' } }, { status: 401 }) };
  }
  return { api: (await mail(ws)).api };
}

/** A `version` query value: absent, or a positive whole number. */
export function versionParam(raw: string | null): { ok: true; version: number | undefined } | { ok: false } {
  if (raw === null || raw === '') return { ok: true, version: undefined };
  return /^[1-9][0-9]{0,9}$/.test(raw) ? { ok: true, version: Number(raw) } : { ok: false };
}

/**
 * The response of the dashboard's export route handlers: the file from the
 * mail service, passed on with its type, its name and the export warnings, so
 * the browser downloads it from the dashboard's own origin and the service
 * token never leaves the server. A failure is JSON (`{ error }`) with the
 * status the screen explains.
 */
export async function exportFileResponse(format: string | null, load: (format: ExportFormat) => Promise<ExportedFile>): Promise<Response> {
  const parsed = ExportFormat.safeParse(format);
  if (!parsed.success) {
    return Response.json({ error: { code: 'validation_failed', message: 'Choose MJML or HTML.' } }, { status: 400 });
  }
  try {
    const file = await load(parsed.data);
    const headers = new Headers({
      'content-type': file.contentType,
      'content-disposition': `attachment; filename="${file.filename.replace(/["\\\r\n]/g, '')}"; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
      'x-content-type-options': 'nosniff',
      'content-security-policy': "sandbox; default-src 'none'",
      'cache-control': 'private, no-store',
      [EXPORT_WARNING_COUNT_HEADER]: String(file.warningCount),
    });
    if (file.warnings.length > 0) headers.set(EXPORT_WARNINGS_HEADER, formatExportWarningsHeader(file.warnings));
    return new Response(file.content, { status: 200, headers });
  } catch (err) {
    unstable_rethrow(err);
    const error = describeError(err);
    const status = error.code === 'not_found' ? 404 : error.code === 'forbidden' || error.code === 'insufficient_role' ? 403 : error.code === 'network' || error.code === 'service_unavailable' ? 503 : 502;
    if (status >= 500) console.error(`[export] ${error.code}${error.requestId ? ` (request ${error.requestId})` : ''}:`, err);
    return Response.json({ error }, { status, headers: { 'cache-control': 'no-store' } });
  }
}
