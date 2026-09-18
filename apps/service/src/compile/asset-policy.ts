import type { AssetPolicy, CompileMessage, CompileResult } from '@marlinjai/mail-contract';
import { Parser } from 'htmlparser2';

/**
 * The `service_only` asset policy: a mail of the workspace may load images,
 * stylesheets and fonts only from the service's own host (where `/a/<id>`
 * serves uploaded and imported assets). This walks the compiled HTML and
 * reports every address that would make a mail client fetch something from
 * anywhere else, as compile errors, so such a document cannot be sent.
 *
 * It fails closed: an address it cannot place on the service's host (relative,
 * protocol-relative to another host, another scheme, built from a merge field,
 * unparseable) is an error, never a pass. `data:` and `cid:` load nothing and
 * are allowed. Links (`<a href>`, `<v:roundrect href>`) are navigation, not
 * loads, and are not checked.
 *
 * What is read:
 * - every `src`, `srcset`, `poster`, `background`, `data`, `lowsrc`, `dynsrc`
 *   attribute, on any element (so `<img>`, `<source>`, `<video>`, `<td
 *   background>`, Outlook's `<v:fill src>` and `<v:image src>`);
 * - `href` and `xlink:href` on `<link>`, `<base>`, `<image>`, `<use>`,
 *   `<feImage>`;
 * - every `url(...)`, `@import` and `image-set(...)` in a `style` attribute or a
 *   `<style>` element (so `@font-face` sources and background images);
 * - the same, inside conditional comments (`<!--[if mso]> ... <![endif]-->`),
 *   which MJML uses for Outlook's background images.
 */

const LOADING_ATTRIBUTES = new Set(['src', 'poster', 'background', 'data', 'lowsrc', 'dynsrc']);
const SRCSET_ATTRIBUTES = new Set(['srcset']);
const HREF_LOADING_TAGS = new Set(['link', 'base', 'image', 'use', 'feimage', 'svg:image', 'svg:use']);
const HREF_ATTRIBUTES = new Set(['href', 'xlink:href']);

/** More than this and the rest are summarised in one line, so a pathological document cannot flood the answer. */
const MAX_REPORTED = 50;
/** Conditional comments nest at most this deep before the rest is refused as unreadable. */
const MAX_COMMENT_DEPTH = 3;

export type FoundAddress = { url: string; where: string };

function stripCssComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

/** Every address a piece of CSS would load: `url(...)`, `@import "..."`, and the strings of `image-set(...)`. */
export function cssAddresses(css: string): string[] {
  const text = stripCssComments(css);
  const found: string[] = [];
  for (const m of text.matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*?))\s*\)/gi)) {
    found.push((m[1] ?? m[2] ?? m[3] ?? '').trim());
  }
  for (const m of text.matchAll(/@import\s+(?:"([^"]*)"|'([^']*)')/gi)) {
    found.push((m[1] ?? m[2] ?? '').trim());
  }
  for (const m of text.matchAll(/image-set\(([^)]*)\)/gi)) {
    for (const s of m[1]!.matchAll(/"([^"]*)"|'([^']*)'/g)) found.push((s[1] ?? s[2] ?? '').trim());
  }
  return found;
}

/** The addresses of a `srcset`: each candidate is an address, optionally followed by a descriptor. */
export function srcsetAddresses(value: string): string[] {
  return value
    .split(/,(?=\s)|,$/)
    .map((candidate) => candidate.trim().split(/\s+/)[0] ?? '')
    .filter((u) => u.length > 0);
}

/** Every address in `html` that makes a mail client load something. */
export function loadedAddresses(html: string, depth = 0): FoundAddress[] {
  const found: FoundAddress[] = [];
  let inStyle = false;
  let styleText = '';

  const parser = new Parser(
    {
      onopentag(name, attributes) {
        const tag = name.toLowerCase();
        if (tag === 'style') {
          inStyle = true;
          styleText = '';
        }
        for (const [rawName, value] of Object.entries(attributes)) {
          const attr = rawName.toLowerCase();
          if (LOADING_ATTRIBUTES.has(attr)) {
            if (value.trim()) found.push({ url: value.trim(), where: `<${tag} ${attr}>` });
          } else if (SRCSET_ATTRIBUTES.has(attr)) {
            for (const url of srcsetAddresses(value)) found.push({ url, where: `<${tag} ${attr}>` });
          } else if (HREF_ATTRIBUTES.has(attr) && HREF_LOADING_TAGS.has(tag)) {
            if (value.trim()) found.push({ url: value.trim(), where: `<${tag} ${attr}>` });
          } else if (attr === 'style') {
            for (const url of cssAddresses(value)) found.push({ url, where: `<${tag} style>` });
          }
        }
      },
      ontext(text) {
        if (inStyle) styleText += text;
      },
      onclosetag(name) {
        if (name.toLowerCase() === 'style' && inStyle) {
          inStyle = false;
          for (const url of cssAddresses(styleText)) found.push({ url, where: '<style>' });
          styleText = '';
        }
      },
      oncomment(comment) {
        // Conditional comments carry real markup for Outlook; read it too.
        if (!/<|url\(|@import/i.test(comment)) return;
        if (depth >= MAX_COMMENT_DEPTH) {
          found.push({ url: '', where: 'a conditional comment nested too deeply to check' });
          return;
        }
        const inner = comment.replace(/^\s*\[if[^\]]*\]>/i, '').replace(/<!\[endif\]\s*$/i, '');
        found.push(...loadedAddresses(inner, depth + 1));
      },
    },
    { decodeEntities: true, lowerCaseAttributeNames: true, lowerCaseTags: true, recognizeSelfClosing: true },
  );
  parser.write(html);
  parser.end();
  return found;
}

/** Why `url` is not allowed on `allowedHost`, or null when it is. */
export function refusal(url: string, allowedHost: string): string | null {
  if (url === '') return 'cannot be checked';
  if (/^(data|cid):/i.test(url)) return null;
  if (/\{\{|\}\}|%7B%7B/i.test(url)) return 'is built from a merge field, so its host cannot be checked before sending';
  let parsed: URL;
  try {
    parsed = url.startsWith('//') ? new URL(`https:${url}`) : new URL(url);
  } catch {
    return 'is not an absolute address';
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return `uses ${parsed.protocol.replace(/:$/, '')}, not http or https`;
  if (parsed.host.toLowerCase() !== allowedHost.toLowerCase()) return `loads from ${parsed.host}`;
  return null;
}

/**
 * The compile errors for `html` under the `service_only` policy: one per
 * distinct offending address and place, at most `MAX_REPORTED`.
 */
export function remoteAssetErrors(html: string, publicBaseUrl: string): CompileMessage[] {
  const allowedHost = new URL(publicBaseUrl).host;
  const errors: CompileMessage[] = [];
  const seen = new Set<string>();
  let over = 0;
  for (const { url, where } of loadedAddresses(html)) {
    const why = refusal(url, allowedHost);
    if (!why) continue;
    const key = `${where} ${url}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (errors.length >= MAX_REPORTED) {
      over += 1;
      continue;
    }
    const shown = url.length > 200 ? `${url.slice(0, 200)}...` : url;
    errors.push({
      message: `${where}: "${shown}" ${why}. This workspace only allows images, stylesheets and fonts from ${allowedHost}: upload the file or import it with assets.import.`,
      path: where,
    });
  }
  if (over > 0) errors.push({ message: `And ${over} more addresses outside ${allowedHost}.` });
  return errors;
}

/** Applies a workspace's policy to a finished compile. `any` changes nothing. */
export function applyAssetPolicy(result: CompileResult, policy: AssetPolicy, publicBaseUrl: string): CompileResult {
  if (policy !== 'service_only' || !result.html) return result;
  const errors = remoteAssetErrors(result.html, publicBaseUrl);
  return errors.length === 0 ? result : { ...result, errors: [...result.errors, ...errors] };
}
