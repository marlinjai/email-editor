import { getConnInfo } from '@hono/node-server/conninfo';
import type { Context } from 'hono';

/**
 * The address a public request came from, for rate limits and consent
 * records (only ever hashed). Behind Cloudflare the edge sets
 * `cf-connecting-ip`; behind another proxy the first `x-forwarded-for` entry is
 * the client; without either, the socket's peer. A request with none of them
 * (an in-process test) is `unknown`, which still rate-limits as one address.
 */
export function clientIp(c: Context): string {
  const cf = c.req.header('cf-connecting-ip')?.trim();
  if (cf) return cf;
  const forwarded = c.req.header('x-forwarded-for')?.split(',')[0]?.trim();
  if (forwarded) return forwarded;
  try {
    return getConnInfo(c).remote.address ?? 'unknown';
  } catch {
    return 'unknown';
  }
}
