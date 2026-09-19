import { createHmac, timingSafeEqual } from 'node:crypto';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { z } from 'zod';
import { ApiError } from '../api-error.js';
import { AssetStorageUnavailable, type AssetStorage } from '../assets/storage.js';
import type { Sealer } from '../sealing.js';
import { unregisterResendEvents } from './providers.js';
import type { AppEnv } from '../context.js';
import type { Sql } from '../db.js';
import { repos } from '../repo/index.js';

/**
 * auth-brain's GDPR erasure webhook (auth-brain docs/plans/2026-07-24-gdpr-erasure.md,
 * signing in auth-brain packages/app/src/lib/erasure/webhook-signature.ts).
 *
 * auth-brain POSTs `{ event_id, kind, user_id, tenant_id?, workspace_ids?,
 * requested_at }` signed with HMAC-SHA256 over the exact raw body, sent as
 * `x-lumitra-erasure-signature: sha256=<hex>`. The erasure is not complete at
 * auth-brain until this answers 2xx, so:
 *
 * - `tenant.erased` erases every workspace created for that company
 *   (`workspaces.company_id`), its uploaded images in Storage Brain first, then
 *   every row, in one transaction. A failure answers 503 and nothing is
 *   recorded, so the redelivery starts over.
 * - A company this service never served acks as a no-op, and so does any kind
 *   it does not act on; otherwise auth-brain would wait on this app forever.
 * - The same event id twice is a no-op success (`erasure_events`).
 */
export const ERASURE_PATH = '/internal/erasure';
export const ERASURE_SIGNATURE_HEADER = 'x-lumitra-erasure-signature';
const MAX_ERASURE_BODY_BYTES = 64 * 1024;

const ErasurePayload = z.object({
  event_id: z.string().min(1).max(128),
  kind: z.string().min(1).max(64),
  user_id: z.string().min(1).max(128),
  tenant_id: z.string().min(1).max(64).optional(),
  workspace_ids: z.array(z.string()).optional(),
  requested_at: z.string().min(1),
});

/** `sha256=<hex>` of HMAC-SHA256 over the raw body, compared in constant time. */
export function verifyErasureSignature(rawBody: string, header: string | undefined, secret: string): boolean {
  if (!header) return false;
  const expected = Buffer.from(`sha256=${createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex')}`);
  const given = Buffer.from(header);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export function erasureRoutes(
  sql: Sql,
  deps: {
    secret: string | undefined;
    storage: AssetStorage;
    log: Pick<Console, 'error' | 'log'>;
    /** Opens the Resend API keys to unregister the events endpoints the service registered. */
    sealer: Sealer;
    /** The HTTP client those unregistrations go through. */
    fetch: typeof fetch;
  },
) {
  const app = new Hono<AppEnv>();
  app.post(
    ERASURE_PATH,
    bodyLimit({
      maxSize: MAX_ERASURE_BODY_BYTES,
      onError: () => {
        throw new ApiError('payload_too_large', `The request body is larger than ${MAX_ERASURE_BODY_BYTES} bytes.`);
      },
    }),
    async (c) => {
      if (!deps.secret) {
        // Fail closed and retryable: auth-brain keeps the event and redelivers.
        throw new ApiError('service_unavailable', 'Erasure is not configured on this service.');
      }
      const raw = await c.req.text();
      if (!verifyErasureSignature(raw, c.req.header(ERASURE_SIGNATURE_HEADER), deps.secret)) {
        throw new ApiError('unauthenticated', 'The erasure signature does not match.');
      }
      let json: unknown;
      try {
        json = JSON.parse(raw);
      } catch {
        throw new ApiError('invalid_request', 'The body is not JSON.');
      }
      const parsed = ErasurePayload.safeParse(json);
      if (!parsed.success) {
        throw new ApiError('validation_failed', 'The erasure event does not have the expected shape.', {
          issues: parsed.error.issues.map((i) => ({ path: i.path, message: i.message })),
        });
      }
      const event = parsed.data;
      const pool = repos(sql);
      if (await pool.erasure.eventHandled(event.event_id)) {
        return c.json({ ok: true, replayed: true, workspaces_erased: 0 });
      }
      if (event.kind !== 'tenant.erased') {
        // Not a kind this service acts on (it keeps no data keyed to one person
        // outside a workspace); acknowledged so auth-brain never waits on it.
        await pool.erasure.recordEvent({ eventId: event.event_id, kind: event.kind, tenantId: event.tenant_id ?? null, workspacesErased: 0 });
        return c.json({ ok: true, replayed: false, workspaces_erased: 0 });
      }
      if (!event.tenant_id) {
        throw new ApiError('validation_failed', 'A tenant.erased event must name its tenant_id.');
      }
      const tenantId = event.tenant_id;

      /** The Resend events endpoints the service registered for the erased workspaces. */
      const endpoints: Array<{ provider_id: string; webhook_id: string; secret_sealed: string | null }> = [];
      const erase = () => sql.begin(async (tx) => {
        const r = repos(tx);
        // Locking the workspace rows also blocks a concurrent upload from adding
        // an image row (its foreign key needs a share lock on the workspace), so
        // the file list read below is complete.
        const workspaceIds = await r.erasure.workspaceIdsForCompany(tenantId);
        for (const workspaceId of workspaceIds) {
          endpoints.push(...(await r.providers.automaticEventEndpoints(workspaceId)));
          for (const fileId of await r.erasure.storageFileIds(workspaceId)) {
            // Throws AssetStorageUnavailable on anything but "already gone": the
            // transaction rolls back and auth-brain redelivers.
            await deps.storage.remove(fileId);
          }
          await r.erasure.eraseWorkspace(workspaceId);
        }
        await r.erasure.recordEvent({ eventId: event.event_id, kind: event.kind, tenantId, workspacesErased: workspaceIds.length });
        return workspaceIds.length;
      });
      let erased: number;
      try {
        erased = await erase();
      } catch (err) {
        if (err instanceof AssetStorageUnavailable) {
          deps.log.error(`[erasure] event ${event.event_id}: Storage Brain did not delete an image, nothing erased yet:`, err.message);
          throw new ApiError('service_unavailable', 'An uploaded image could not be deleted yet; nothing was erased. Retry later.');
        }
        throw err;
      }
      deps.log.log(`[erasure] event ${event.event_id}: erased ${erased} workspace(s) of company ${tenantId}`);
      // Best effort, after the erasure committed: Resend would otherwise keep
      // posting to endpoints whose provider is gone (they answer 404).
      for (const e of endpoints) {
        if (!e.secret_sealed) continue;
        try {
          await unregisterResendEvents({ fetch: deps.fetch, verifyTimeoutMs: 10_000, log: deps.log }, e.webhook_id, deps.sealer.open(e.secret_sealed));
        } catch (err) {
          deps.log.error(`[erasure] could not unregister Resend events endpoint ${e.webhook_id} of provider ${e.provider_id}:`, err);
        }
      }
      return c.json({ ok: true, replayed: false, workspaces_erased: erased });
    },
  );
  return app;
}
