import type { WebhookDeliveryStatus, WebhookEvent, WebhookEventType } from '@marlinjai/mail-contract';
import type { Db } from '../db.js';
import { asJson } from './json.js';

export type WebhookEndpointRow = {
  id: string;
  url: string;
  description: string | null;
  events: WebhookEventType[];
  enabled: boolean;
  created_at: string;
  updated_at: string;
};

export type WebhookDeliveryRow = {
  id: string;
  endpoint_id: string;
  event_id: string;
  event_type: WebhookEventType;
  status: WebhookDeliveryStatus;
  attempts: number;
  last_status_code: number | null;
  last_error: string | null;
  next_attempt_at: string | null;
  delivered_at: string | null;
  created_at: string;
};

/**
 * What the delivery loop needs to send one delivery. `secret_sealed` is the
 * endpoint's current signing secret; `previous_secret_sealed` is still valid
 * until `previous_secret_expires_at` (0007's rotation window), and the loop
 * signs with both while it holds. `enabled` lets the loop skip (never attempt,
 * never consume a retry) a delivery whose endpoint was disabled after it was
 * queued.
 */
export type DueDelivery = {
  workspace_id: string;
  id: string;
  endpoint_id: string;
  attempts: number;
  url: string;
  enabled: boolean;
  secret_sealed: string;
  previous_secret_sealed: string | null;
  previous_secret_expires_at: string | null;
  payload: WebhookEvent;
};

const ENDPOINT = 'id, url, description, events, enabled, created_at, updated_at';
const DELIVERY = `id, endpoint_id, event_id, event_type, status, attempts, last_status_code, last_error, next_attempt_at,
  delivered_at, created_at`;

export function webhookEndpointsRepo(db: Db) {
  return {
    /** `secretSealed` is `Sealer.seal(secret)`; the plaintext is returned to the caller once and never stored. */
    async create(
      workspaceId: string,
      input: { url: string; description: string | null; events: WebhookEventType[]; enabled: boolean; secretSealed: string },
    ): Promise<WebhookEndpointRow> {
      const rows = await db<WebhookEndpointRow[]>`
        INSERT INTO webhook_endpoints (workspace_id, url, description, events, enabled, secret_sealed)
        VALUES (${workspaceId}, ${input.url}, ${input.description}, ${input.events}, ${input.enabled}, ${input.secretSealed})
        RETURNING ${db.unsafe(ENDPOINT)}`;
      return rows[0]!;
    },

    async get(workspaceId: string, endpointId: string): Promise<WebhookEndpointRow | null> {
      const rows = await db<WebhookEndpointRow[]>`
        SELECT ${db.unsafe(ENDPOINT)} FROM webhook_endpoints WHERE workspace_id = ${workspaceId} AND id = ${endpointId}`;
      return rows[0] ?? null;
    },

    async exists(workspaceId: string, endpointId: string): Promise<boolean> {
      const rows = await db`SELECT 1 FROM webhook_endpoints WHERE workspace_id = ${workspaceId} AND id = ${endpointId}`;
      return rows.length > 0;
    },

    async list(workspaceId: string, page: { afterId?: string; limit: number }): Promise<WebhookEndpointRow[]> {
      return db<WebhookEndpointRow[]>`
        SELECT ${db.unsafe(ENDPOINT)} FROM webhook_endpoints
        WHERE workspace_id = ${workspaceId}
        ${
          page.afterId
            ? db`AND (created_at, id) > (SELECT created_at, id FROM webhook_endpoints WHERE workspace_id = ${workspaceId} AND id = ${page.afterId})`
            : db``
        }
        ORDER BY created_at, id
        LIMIT ${page.limit}`;
    },

    async update(
      workspaceId: string,
      endpointId: string,
      patch: { url?: string; description?: string | null; events?: WebhookEventType[]; enabled?: boolean },
    ): Promise<WebhookEndpointRow | null> {
      const rows = await db<WebhookEndpointRow[]>`
        UPDATE webhook_endpoints SET
          url = COALESCE(${patch.url ?? null}, url),
          description = ${patch.description === undefined ? db`description` : db`${patch.description}`},
          events = COALESCE(${patch.events ?? null}::text[], events),
          enabled = COALESCE(${patch.enabled ?? null}::boolean, enabled),
          updated_at = now()
        WHERE workspace_id = ${workspaceId} AND id = ${endpointId}
        RETURNING ${db.unsafe(ENDPOINT)}`;
      return rows[0] ?? null;
    },

    /**
     * Rotates the signing secret. The old secret moves to `previous_secret_sealed`
     * and keeps signing (alongside the new one) until `previousExpiresAt`, so a
     * receiver has a window to pick up the new secret before the old one stops
     * working. One UPDATE, so there is no read-then-write race with a concurrent
     * rotation.
     */
    async rotateSecret(
      workspaceId: string,
      endpointId: string,
      newSecretSealed: string,
      previousExpiresAt: Date,
    ): Promise<WebhookEndpointRow | null> {
      const rows = await db<WebhookEndpointRow[]>`
        UPDATE webhook_endpoints SET
          previous_secret_sealed = secret_sealed,
          previous_secret_expires_at = ${previousExpiresAt},
          secret_sealed = ${newSecretSealed},
          updated_at = now()
        WHERE workspace_id = ${workspaceId} AND id = ${endpointId}
        RETURNING ${db.unsafe(ENDPOINT)}`;
      return rows[0] ?? null;
    },

    /** Deleting an endpoint deletes its deliveries. */
    async delete(workspaceId: string, endpointId: string): Promise<boolean> {
      const rows = await db`DELETE FROM webhook_endpoints WHERE workspace_id = ${workspaceId} AND id = ${endpointId} RETURNING id`;
      return rows.length > 0;
    },
  };
}

export function webhookEventsRepo(db: Db) {
  return {
    /**
     * Stores an event and queues one pending delivery for every enabled endpoint
     * of the workspace subscribed to its type. Use `emitEvent` (src/events.ts),
     * which builds and validates the envelope, rather than calling this directly.
     */
    async insertWithDeliveries(workspaceId: string, event: WebhookEvent): Promise<number> {
      await db`
        INSERT INTO webhook_events (id, workspace_id, type, payload, created_at)
        VALUES (${event.id}, ${workspaceId}, ${event.type}, ${asJson(db, event)}, ${event.created_at})`;
      const rows = await db`
        INSERT INTO webhook_deliveries (workspace_id, endpoint_id, event_id, event_type)
        SELECT ${workspaceId}, e.id, ${event.id}, ${event.type}
        FROM webhook_endpoints e
        WHERE e.workspace_id = ${workspaceId} AND e.enabled AND ${event.type} = ANY(e.events)
        RETURNING id`;
      return rows.length;
    },

    async get(workspaceId: string, eventId: string): Promise<WebhookEvent | null> {
      const rows = await db<{ payload: WebhookEvent }[]>`
        SELECT payload FROM webhook_events WHERE workspace_id = ${workspaceId} AND id = ${eventId}`;
      return rows[0]?.payload ?? null;
    },
  };
}

export function webhookDeliveriesRepo(db: Db) {
  return {
    async get(workspaceId: string, deliveryId: string): Promise<WebhookDeliveryRow | null> {
      const rows = await db<WebhookDeliveryRow[]>`
        SELECT ${db.unsafe(DELIVERY)} FROM webhook_deliveries WHERE workspace_id = ${workspaceId} AND id = ${deliveryId}`;
      return rows[0] ?? null;
    },

    async exists(workspaceId: string, endpointId: string, deliveryId: string): Promise<boolean> {
      const rows = await db`
        SELECT 1 FROM webhook_deliveries
        WHERE workspace_id = ${workspaceId} AND endpoint_id = ${endpointId} AND id = ${deliveryId}`;
      return rows.length > 0;
    },

    async list(
      workspaceId: string,
      endpointId: string,
      query: { afterId?: string; limit: number; status?: WebhookDeliveryStatus; eventType?: WebhookEventType },
    ): Promise<WebhookDeliveryRow[]> {
      return db<WebhookDeliveryRow[]>`
        SELECT ${db.unsafe(DELIVERY)} FROM webhook_deliveries
        WHERE workspace_id = ${workspaceId} AND endpoint_id = ${endpointId}
        ${query.status ? db`AND status = ${query.status}` : db``}
        ${query.eventType ? db`AND event_type = ${query.eventType}` : db``}
        ${
          query.afterId
            ? db`AND (created_at, id) < (SELECT created_at, id FROM webhook_deliveries
                 WHERE workspace_id = ${workspaceId} AND endpoint_id = ${endpointId} AND id = ${query.afterId})`
            : db``
        }
        ORDER BY created_at DESC, id DESC
        LIMIT ${query.limit}`;
    },

    /**
     * Claims due pending deliveries, across workspaces, with `SKIP LOCKED`, and
     * pushes their next attempt out by `leaseSeconds` so a crashed sender's claim
     * comes due again instead of being lost. Deliberately unscoped (the loop
     * serves every workspace); each row names its workspace, and the result is
     * recorded through the scoped `recordAttempt`.
     */
    async claimDueForWorker(limit: number, leaseSeconds: number): Promise<DueDelivery[]> {
      return db<DueDelivery[]>`
        WITH due AS (
          SELECT id FROM webhook_deliveries
          WHERE status = 'pending' AND next_attempt_at <= now()
          ORDER BY next_attempt_at, id
          LIMIT ${limit}
          FOR UPDATE SKIP LOCKED
        ), leased AS (
          UPDATE webhook_deliveries d SET next_attempt_at = now() + make_interval(secs => ${leaseSeconds})
          FROM due WHERE d.id = due.id
          RETURNING d.id, d.workspace_id, d.attempts, d.endpoint_id, d.event_id
        )
        SELECT l.workspace_id, l.id, l.attempts, l.endpoint_id, e.url, e.enabled,
               e.secret_sealed, e.previous_secret_sealed, e.previous_secret_expires_at, ev.payload
        FROM leased l
        JOIN webhook_endpoints e ON e.workspace_id = l.workspace_id AND e.id = l.endpoint_id
        JOIN webhook_events ev ON ev.workspace_id = l.workspace_id AND ev.id = l.event_id`;
    },

    /**
     * Records one attempt: `succeeded`, `failed` for good, or back to `pending`
     * with the next attempt time (the contract's WEBHOOK_RETRY_DELAYS_SECONDS).
     * `responseSnippet` and `durationMs` are diagnostics for operators, never
     * returned by the API.
     */
    async recordAttempt(
      workspaceId: string,
      deliveryId: string,
      result:
        | { status: 'succeeded'; statusCode: number; responseSnippet?: string | null; durationMs?: number | null }
        | { status: 'failed'; statusCode: number | null; error: string; responseSnippet?: string | null; durationMs?: number | null }
        | {
            status: 'pending';
            statusCode: number | null;
            error: string;
            nextAttemptAt: Date;
            responseSnippet?: string | null;
            durationMs?: number | null;
          },
    ): Promise<WebhookDeliveryRow | null> {
      const rows = await db<WebhookDeliveryRow[]>`
        UPDATE webhook_deliveries SET
          status = ${result.status},
          attempts = attempts + 1,
          last_status_code = ${result.statusCode},
          last_error = ${result.status === 'succeeded' ? null : result.error},
          last_response_snippet = ${result.responseSnippet ?? null},
          last_duration_ms = ${result.durationMs ?? null},
          next_attempt_at = ${result.status === 'pending' ? result.nextAttemptAt : null},
          delivered_at = ${result.status === 'succeeded' ? db`now()` : db`NULL`}
        WHERE workspace_id = ${workspaceId} AND id = ${deliveryId}
        RETURNING ${db.unsafe(DELIVERY)}`;
      return rows[0] ?? null;
    },

    /** Redelivery resets the existing row to pending and due now; it never adds a row. */
    async resetForRedelivery(workspaceId: string, endpointId: string, deliveryId: string): Promise<WebhookDeliveryRow | null> {
      const rows = await db<WebhookDeliveryRow[]>`
        UPDATE webhook_deliveries SET status = 'pending', attempts = 0, next_attempt_at = now(), delivered_at = NULL,
          last_error = NULL, last_status_code = NULL, last_response_snippet = NULL, last_duration_ms = NULL
        WHERE workspace_id = ${workspaceId} AND endpoint_id = ${endpointId} AND id = ${deliveryId}
        RETURNING ${db.unsafe(DELIVERY)}`;
      return rows[0] ?? null;
    },
  };
}
