import { Hono } from 'hono';
import { ApiError } from '../api-error.js';
import { actorOf, type AppEnv } from '../context.js';
import type { Sql } from '../db.js';
import { mount, type MountDeps } from '../mount.js';
import { repos } from '../repo/index.js';
import { body, pageArgs, params, query, rowId, toPage } from '../validate.js';
import { generateWebhookSecret, WEBHOOK_SECRET_ROTATION_WINDOW_MS } from '../webhooks/secret.js';
import { assertWebhookUrlAllowed, SsrfBlockedError, type SsrfPolicy } from '../webhooks/ssrf.js';

/**
 * `webhook_endpoints`, their deliveries and manual redelivery. The signing
 * secret is shown once (on create and on rotation) and stored only sealed
 * (`Sealer`); the delivery loop that actually sends events lives in
 * `src/webhooks/loop.ts`, started from `src/main.ts`.
 */
export function webhookRoutes(sql: Sql, deps: MountDeps, urlPolicy: SsrfPolicy = {}) {
  const app = new Hono<AppEnv>();
  const { pool, sealer } = deps;

  async function assertUrlOrThrow(url: string) {
    try {
      await assertWebhookUrlAllowed(url, urlPolicy);
    } catch (err) {
      if (err instanceof SsrfBlockedError) {
        throw new ApiError('invalid_request', `This webhook URL cannot be used: ${err.message}.`);
      }
      throw err;
    }
  }

  mount(app, 'webhooks.list', deps, async (c) => {
    const { workspaceId } = c.get('access');
    const q = query(c, 'webhooks.list');
    const page = await pageArgs(q, (id) => pool.webhookEndpoints.exists(workspaceId, id));
    const rows = await pool.webhookEndpoints.list(workspaceId, { afterId: page.afterId, limit: page.limit + 1 });
    return c.json(toPage(rows, page.limit));
  });

  // The plaintext secret is in this response and nowhere else in the clear.
  mount(app, 'webhooks.create', deps, async (c) => {
    const access = c.get('access');
    const input = await body(c, 'webhooks.create');
    await assertUrlOrThrow(input.url);
    const secret = generateWebhookSecret();
    const endpoint = await sql.begin(async (tx) => {
      const r = repos(tx);
      const created = await r.webhookEndpoints.create(access.workspaceId, {
        url: input.url,
        description: input.description ?? null,
        events: input.events,
        enabled: input.enabled ?? true,
        secretSealed: sealer.seal(secret),
      });
      await r.audit.record(access.workspaceId, {
        action: 'webhook.created',
        actor: actorOf(access),
        targetType: 'webhook_endpoint',
        targetId: created.id,
        details: { url: created.url, events: created.events },
      });
      return created;
    });
    c.header('cache-control', 'no-store');
    return c.json({ endpoint, secret }, 201);
  });

  mount(app, 'webhooks.get', deps, async (c) => {
    const { workspaceId } = c.get('access');
    const id = rowId(params(c, 'webhooks.get').id, 'webhook endpoint');
    const endpoint = await pool.webhookEndpoints.get(workspaceId, id);
    if (!endpoint) throw new ApiError('not_found', 'No such webhook endpoint in this workspace.');
    return c.json(endpoint);
  });

  mount(app, 'webhooks.update', deps, async (c) => {
    const access = c.get('access');
    const id = rowId(params(c, 'webhooks.update').id, 'webhook endpoint');
    const input = await body(c, 'webhooks.update');
    if (input.url !== undefined) await assertUrlOrThrow(input.url);
    const endpoint = await sql.begin(async (tx) => {
      const r = repos(tx);
      const updated = await r.webhookEndpoints.update(access.workspaceId, id, input);
      if (!updated) throw new ApiError('not_found', 'No such webhook endpoint in this workspace.');
      await r.audit.record(access.workspaceId, {
        action: 'webhook.updated',
        actor: actorOf(access),
        targetType: 'webhook_endpoint',
        targetId: id,
        details: { ...input },
      });
      return updated;
    });
    return c.json(endpoint);
  });

  mount(app, 'webhooks.delete', deps, async (c) => {
    const access = c.get('access');
    const id = rowId(params(c, 'webhooks.delete').id, 'webhook endpoint');
    await sql.begin(async (tx) => {
      const r = repos(tx);
      const deleted = await r.webhookEndpoints.delete(access.workspaceId, id);
      if (!deleted) throw new ApiError('not_found', 'No such webhook endpoint in this workspace.');
      await r.audit.record(access.workspaceId, {
        action: 'webhook.deleted',
        actor: actorOf(access),
        targetType: 'webhook_endpoint',
        targetId: id,
      });
    });
    return c.json({ ok: true as const });
  });

  // During the rotation window (WEBHOOK_SECRET_ROTATION_WINDOW_MS) both the old
  // and the new secret sign outgoing deliveries, so a receiver has time to pick
  // up the new one before the old one stops being accepted.
  mount(app, 'webhooks.rotateSecret', deps, async (c) => {
    const access = c.get('access');
    const id = rowId(params(c, 'webhooks.rotateSecret').id, 'webhook endpoint');
    const secret = generateWebhookSecret();
    const result = await sql.begin(async (tx) => {
      const r = repos(tx);
      const updated = await r.webhookEndpoints.rotateSecret(
        access.workspaceId,
        id,
        sealer.seal(secret),
        new Date(Date.now() + WEBHOOK_SECRET_ROTATION_WINDOW_MS),
      );
      if (!updated) throw new ApiError('not_found', 'No such webhook endpoint in this workspace.');
      await r.audit.record(access.workspaceId, {
        action: 'webhook.secret_rotated',
        actor: actorOf(access),
        targetType: 'webhook_endpoint',
        targetId: id,
      });
      return updated;
    });
    c.header('cache-control', 'no-store');
    return c.json({ endpoint: result, secret });
  });

  mount(app, 'webhooks.deliveries', deps, async (c) => {
    const { workspaceId } = c.get('access');
    const endpointId = rowId(params(c, 'webhooks.deliveries').id, 'webhook endpoint');
    if (!(await pool.webhookEndpoints.exists(workspaceId, endpointId))) {
      throw new ApiError('not_found', 'No such webhook endpoint in this workspace.');
    }
    const q = query(c, 'webhooks.deliveries');
    const page = await pageArgs(q, (id) => pool.webhookDeliveries.exists(workspaceId, endpointId, id));
    const rows = await pool.webhookDeliveries.list(workspaceId, endpointId, {
      afterId: page.afterId,
      limit: page.limit + 1,
      status: q.status,
      eventType: q.event_type,
    });
    return c.json(toPage(rows, page.limit));
  });

  // Resets the existing delivery row to pending, due now; the next poll of the
  // delivery loop picks it up like any other due delivery. It never adds a row.
  mount(app, 'webhooks.redeliver', deps, async (c) => {
    const access = c.get('access');
    const { id: endpointId, delivery_id: deliveryId } = params(c, 'webhooks.redeliver');
    const validEndpointId = rowId(endpointId, 'webhook endpoint');
    const validDeliveryId = rowId(deliveryId, 'delivery');
    const delivery = await sql.begin(async (tx) => {
      const r = repos(tx);
      const reset = await r.webhookDeliveries.resetForRedelivery(access.workspaceId, validEndpointId, validDeliveryId);
      if (!reset) throw new ApiError('not_found', 'No such delivery for this webhook endpoint.');
      await r.audit.record(access.workspaceId, {
        action: 'webhook.updated',
        actor: actorOf(access),
        targetType: 'webhook_delivery',
        targetId: validDeliveryId,
        details: { action: 'redeliver', endpoint_id: validEndpointId },
      });
      return reset;
    });
    return c.json(delivery, 202);
  });

  return app;
}
