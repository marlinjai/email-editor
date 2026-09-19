import {
  EXPORT_CONTENT_TYPES,
  EXPORT_WARNINGS_HEADER,
  EXPORT_WARNING_COUNT_HEADER,
  exportFilename,
  formatExportWarningsHeader,
  type CompileResult,
  type ExportFormat,
  type RemoteImage,
} from '@marlinjai/mail-contract';
import { ApiError } from '../api-error.js';
import { loadedAddresses, refusal } from './asset-policy.js';

/**
 * Helpers of the MJML import and export (src/routes/mjml-io.ts): finding the
 * remote images an imported document loads, pointing a document at copies of
 * them, making the service's own asset addresses absolute, and building the
 * file response of an export.
 */

const IMAGE_EXTENSION = /\.(png|jpe?g|gif|webp|svg|bmp|avif)(\?|#|$)/i;

/**
 * The images `html` loads from anywhere but the service's own host, once each,
 * in document order. Stylesheets and fonts (`<link href>`, `@import`) are not
 * images: an import cannot copy them, and the export reports them instead. A
 * CSS `url()` in a `<style>` element counts only when it names an image file.
 */
export function remoteImages(html: string, publicBaseUrl: string): RemoteImage[] {
  const host = new URL(publicBaseUrl).host;
  const seen = new Set<string>();
  const out: RemoteImage[] = [];
  for (const { url, where } of loadedAddresses(html)) {
    if (!/^https?:\/\//i.test(url) && !url.startsWith('//')) continue;
    if (refusal(url, host) === null) continue;
    if (where.startsWith('<link') || where.startsWith('<base')) continue;
    if (where === '<style>' && !IMAGE_EXTENSION.test(url)) continue;
    if (seen.has(url)) continue;
    seen.add(url);
    out.push({ url, where });
  }
  return out;
}

/** Every spelling of `url` a document can hold: as written, and XML-escaped (`&amp;`), each as it sits inside a JSON string. */
function spellings(url: string): string[] {
  const forms = new Set([url, url.replace(/&/g, '&amp;')]);
  return [...forms].map((f) => JSON.stringify(f).slice(1, -1));
}

/** The document with every occurrence of each `from` address replaced by its `to`. */
export function replaceAddresses<T>(document: T, replacements: ReadonlyMap<string, string>): T {
  let json = JSON.stringify(document);
  for (const [from, to] of replacements) {
    const target = JSON.stringify(to).slice(1, -1);
    for (const spelling of spellings(from)) json = json.split(spelling).join(target);
  }
  return JSON.parse(json) as T;
}

const OWN_ASSET = /(["'(=\s])\/a\/([0-9a-fA-F-]{36})(?=["')\s?#]|\\")/g;

/**
 * The document with the service's own relative asset addresses (`/a/<id>`)
 * made absolute on `publicBaseUrl`, so an exported file works wherever it is
 * opened. Absolute addresses are left as they are.
 */
export function absoluteAssetUrls<T>(document: T, publicBaseUrl: string): T {
  const base = publicBaseUrl.replace(/\/+$/, '');
  return JSON.parse(JSON.stringify(document).replace(OWN_ASSET, (_m, before: string, id: string) => `${before}${base}/a/${id}`)) as T;
}

/**
 * The file response of an export. Never refused for the document's problems:
 * MJML errors and the asset policy's findings travel in the warnings header.
 * Only a compile that produced nothing (it timed out, the worker died) is an
 * error, `service_unavailable`, since there is no file to give.
 */
export function exportResponse(compiled: CompileResult, format: ExportFormat, name: string): Response {
  const content = format === 'mjml' ? compiled.mjml : compiled.html;
  if (!content) {
    throw new ApiError('service_unavailable', `The document could not be compiled right now: ${compiled.errors[0]?.message ?? 'no output'}`, {
      errors: compiled.errors,
    });
  }
  const messages = [...compiled.errors, ...compiled.warnings];
  const filename = exportFilename(name, format);
  const headers = new Headers({
    'content-type': EXPORT_CONTENT_TYPES[format],
    'content-disposition': `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    // A downloaded file, never a page of the API's origin.
    'x-content-type-options': 'nosniff',
    'content-security-policy': "sandbox; default-src 'none'",
    'cache-control': 'private, no-store',
    [EXPORT_WARNING_COUNT_HEADER]: String(messages.length),
  });
  if (messages.length > 0) headers.set(EXPORT_WARNINGS_HEADER, formatExportWarningsHeader(messages));
  return new Response(content, { status: 200, headers });
}
