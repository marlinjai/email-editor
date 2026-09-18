import { getConnInfo } from '@hono/node-server/conninfo';
import { Hono, type Context } from 'hono';
import type { AppEnv } from '../context.js';
import type { Sql } from '../db.js';
import { effectiveTracking } from '../platform/tracking-settings.js';
import {
  classifyClick,
  classifyOpen,
  clientAddress,
  CLICK_PATH_PREFIX,
  OPEN_PATH_PREFIX,
  type TrackingTokens,
} from '../platform/tracking.js';
import { repos } from '../repo/index.js';

/** A 1x1 transparent GIF. */
const PIXEL = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');

const NO_STORE = 'no-store, no-cache, must-revalidate, private';

/**
 * The open pixel `/t/o/<token>` and the click redirect `/t/c/<token>`, public
 * and outside /v1 like the unsubscribe page.
 *
 * - The token is signed and binds workspace, mailing, recipient (and the link's
 *   number); nothing in the request can change what it names. The click's
 *   destination is read from the mailing's numbered links, so this is never an
 *   open redirect: a token can only lead where the mailing itself linked.
 * - Nothing is recorded unless the mailing was sent with that tracking AND the
 *   workspace tracks it now. A mailing sent without tracking never carried a
 *   token, so any token for it is refused (404), and so is every open when the
 *   workspace's opens are off. A click on a mailing that was sent with click
 *   tracking still reaches its destination after the workspace turned tracking
 *   off (the person's link keeps working), but nothing is recorded.
 * - Nothing about the person is stored: the address and user agent only decide,
 *   on arrival, whether the event came from a machine (a scanner, a prefetcher)
 *   or from Apple Mail Privacy Protection, and only those flags are kept.
 * - HEAD requests (link checkers) are answered and never recorded.
 */
export function trackingRoutes(sql: Sql, deps: { tokens: TrackingTokens }) {
  const app = new Hono<AppEnv>();
  const pool = repos(sql);

  const address = (c: Context<AppEnv>) => {
    let socket: string | undefined;
    try {
      socket = getConnInfo(c).remote.address;
    } catch {
      socket = undefined; // not served by @hono/node-server (app.request in tests)
    }
    return clientAddress((name) => c.req.header(name), socket);
  };

  const notFound = (c: Context<AppEnv>) => {
    c.header('Cache-Control', NO_STORE);
    return c.text('Not found', 404);
  };

  app.get(`${OPEN_PATH_PREFIX}:token`, async (c) => {
    const claims = deps.tokens.verifyOpen(c.req.param('token'));
    if (!claims) return notFound(c);
    const mailing = await pool.mailings.get(claims.workspaceId, claims.mailingId);
    if (!mailing?.tracking?.opens) return notFound(c);
    if (!(await effectiveTracking(sql, claims.workspaceId)).opens) return notFound(c);
    const recipient = await pool.recipients.get(claims.workspaceId, claims.recipientId);
    if (recipient && recipient.mailing_id === mailing.id && c.req.method === 'GET') {
      const flags = classifyOpen(c.req.header('user-agent'), address(c));
      await pool.mailingPlatform.insertEvent(claims.workspaceId, {
        mailingId: mailing.id,
        recipientId: recipient.id,
        contactId: recipient.contact_id,
        variant: recipient.variant,
        kind: 'open',
        linkIdx: null,
        ...flags,
      });
    }
    c.header('Cache-Control', NO_STORE);
    c.header('Content-Type', 'image/gif');
    c.header('Content-Length', String(PIXEL.length));
    return c.body(new Uint8Array(PIXEL), 200);
  });

  app.get(`${CLICK_PATH_PREFIX}:token`, async (c) => {
    const claims = deps.tokens.verifyClick(c.req.param('token'));
    if (!claims) return notFound(c);
    const mailing = await pool.mailings.get(claims.workspaceId, claims.mailingId);
    if (!mailing?.tracking?.clicks) return notFound(c);
    const url = await pool.mailingPlatform.link(claims.workspaceId, mailing.id, claims.linkIdx);
    if (!url) return notFound(c);
    const recipient = await pool.recipients.get(claims.workspaceId, claims.recipientId);
    if (
      recipient &&
      recipient.mailing_id === mailing.id &&
      c.req.method === 'GET' &&
      (await effectiveTracking(sql, claims.workspaceId)).clicks
    ) {
      const sentAt = recipient.message_id ? (await pool.messages.get(claims.workspaceId, recipient.message_id))?.created_at : null;
      const flags = classifyClick(c.req.header('user-agent'), sentAt ? Date.now() - new Date(sentAt).getTime() : null);
      await pool.mailingPlatform.insertEvent(claims.workspaceId, {
        mailingId: mailing.id,
        recipientId: recipient.id,
        contactId: recipient.contact_id,
        variant: recipient.variant,
        kind: 'click',
        linkIdx: claims.linkIdx,
        isMachine: flags.isMachine,
        isAppleMpp: false,
      });
    }
    c.header('Cache-Control', NO_STORE);
    c.header('Referrer-Policy', 'no-referrer');
    return c.redirect(url, 302);
  });

  return app;
}
