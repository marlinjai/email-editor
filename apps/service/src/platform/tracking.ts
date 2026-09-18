import { createPurposeSigner, type RootKeys } from './tokens.js';

/**
 * Open and click tracking: the tokens in the pixel and link URLs, rewriting a
 * recipient's HTML, and classifying who fetched them. Only ever used for a
 * mailing whose tracking snapshot says so (see start-mailing.ts); a workspace
 * with tracking off gets untouched HTML.
 */

export const OPEN_PATH_PREFIX = '/t/o/';
export const CLICK_PATH_PREFIX = '/t/c/';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export type OpenClaims = { workspaceId: string; mailingId: string; recipientId: string };
export type ClickClaims = OpenClaims & { linkIdx: number };

export type TrackingTokens = {
  open(c: OpenClaims): string;
  click(c: ClickClaims): string;
  verifyOpen(token: string): OpenClaims | null;
  verifyClick(token: string): ClickClaims | null;
};

/** Tokens bind workspace, mailing and recipient (and the link's number): nothing a request can change. */
export function createTrackingTokens(keys: RootKeys): TrackingTokens {
  const opens = createPurposeSigner(keys, 'track-open');
  const clicks = createPurposeSigner(keys, 'track-click');
  const ids = (parts: string[]) => parts.length >= 3 && parts.slice(0, 3).every((p) => UUID.test(p));
  return {
    open: (c) => opens.sign(`${c.workspaceId}.${c.mailingId}.${c.recipientId}`),
    click: (c) => clicks.sign(`${c.workspaceId}.${c.mailingId}.${c.recipientId}.${c.linkIdx}`),
    verifyOpen(token) {
      const parts = opens.verify(token)?.split('.');
      if (!parts || parts.length !== 3 || !ids(parts)) return null;
      return { workspaceId: parts[0]!, mailingId: parts[1]!, recipientId: parts[2]! };
    },
    verifyClick(token) {
      const parts = clicks.verify(token)?.split('.');
      if (!parts || parts.length !== 4 || !ids(parts) || !/^\d{1,6}$/.test(parts[3]!)) return null;
      return { workspaceId: parts[0]!, mailingId: parts[1]!, recipientId: parts[2]!, linkIdx: Number(parts[3]) };
    },
  };
}

const ANCHOR_HREF = /(<a\b[^>]*?\bhref\s*=\s*)(["'])(.*?)\2/gis;

function decodeAttribute(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

/**
 * The absolute http(s) links of compiled HTML, in document order, without
 * duplicates. A link with a merge field (`{{...}}`, e.g. `{{unsubscribe_url}}`)
 * differs per recipient and is never tracked, so the unsubscribe link and
 * personalised links stay exactly as written.
 */
export function extractLinks(html: string): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(ANCHOR_HREF)) {
    const url = decodeAttribute(m[3]!.trim());
    if (!/^https?:\/\//i.test(url) || url.includes('{{') || url.length > 4096) continue;
    if (!out.includes(url)) out.push(url);
  }
  return out;
}

/**
 * One recipient's final HTML with tracking: every link numbered in `links` is
 * pointed at its click URL, and the open pixel goes in before `</body>`. Links
 * not in `links` (personalised ones, the unsubscribe link) are left alone.
 */
export function applyTracking(
  html: string,
  opts: { openUrl: string | null; clickUrl: ((idx: number) => string) | null; links: ReadonlyMap<string, number> },
): string {
  let out = html;
  if (opts.clickUrl) {
    const clickUrl = opts.clickUrl;
    out = out.replace(ANCHOR_HREF, (whole, head: string, quote: string, value: string) => {
      const idx = opts.links.get(decodeAttribute(value.trim()));
      return idx === undefined ? whole : `${head}${quote}${clickUrl(idx)}${quote}`;
    });
  }
  if (opts.openUrl) {
    const pixel = `<img src="${opts.openUrl}" width="1" height="1" alt="" style="display:block;border:0;width:1px;height:1px;overflow:hidden" />`;
    const close = out.search(/<\/body>/i);
    out = close === -1 ? out + pixel : out.slice(0, close) + pixel + out.slice(close);
  }
  return out;
}

/**
 * Security scanners, link checkers and prefetchers that fetch what a person
 * never opened. Gmail's and Yahoo's image proxies fetch on a real open, so they
 * are not listed.
 */
const MACHINE_AGENTS =
  /(bot\b|crawler|spider|headless|python-requests|curl\/|wget|go-http-client|java\/|okhttp|libwww|scanner|proofpoint|mimecast|barracuda|messagelabs|symantec|fireeye|trendmicro|forcepoint|ironport|safelinks|urldefense|linkscanner|sophos|zscaler|checkpoint|cloudmark|microsoft office protocol discovery)/i;

/** How soon after delivery a click is a scanner rather than a person. */
export const MACHINE_CLICK_WINDOW_MS = 5_000;

/**
 * Apple Mail Privacy Protection loads every image through Apple's proxy when a
 * message arrives, whether or not anyone reads it. Its requests carry a bare
 * `Mozilla/5.0` and come from Apple's network, 17.0.0.0/8.
 */
export function isAppleMpp(userAgent: string | undefined, ip: string | undefined): boolean {
  if ((userAgent ?? '').trim() === 'Mozilla/5.0') return true;
  return ip !== undefined && /^17\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(ip);
}

export function classifyOpen(userAgent: string | undefined, ip: string | undefined): { isMachine: boolean; isAppleMpp: boolean } {
  const mpp = isAppleMpp(userAgent, ip);
  return { isMachine: !mpp && (!userAgent || MACHINE_AGENTS.test(userAgent)), isAppleMpp: mpp };
}

export function classifyClick(userAgent: string | undefined, msSinceSent: number | null): { isMachine: boolean } {
  const tooSoon = msSinceSent !== null && msSinceSent < MACHINE_CLICK_WINDOW_MS;
  return { isMachine: !userAgent || MACHINE_AGENTS.test(userAgent) || tooSoon };
}

/** The client address, as the edge in front of the service reports it. */
export function clientAddress(header: (name: string) => string | undefined, fallback: string | undefined): string | undefined {
  const cf = header('cf-connecting-ip')?.trim();
  if (cf) return cf;
  const forwarded = header('x-forwarded-for')?.split(',')[0]?.trim();
  return forwarded || fallback;
}
