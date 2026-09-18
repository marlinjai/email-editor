import { WEBHOOK_MAX_ATTEMPTS, WEBHOOK_RETRY_DELAYS_SECONDS } from '@marlinjai/mail-contract';
import type { Db } from '../db.js';
import type { DueDelivery } from '../repo/webhooks.js';
import { repos } from '../repo/index.js';
import type { Sealer } from '../sealing.js';
import { assertResolvesToPublicAddress, type SsrfPolicy } from './ssrf.js';
import { buildWebhookHeaders, validSecretsFor } from './signing.js';

const SEND_TIMEOUT_MS = 10_000;
const RESPONSE_SNIPPET_MAX = 500;

export type DeliverDeps = { sealer: Sealer; policy?: SsrfPolicy; fetchImpl?: typeof fetch };

/**
 * Attempts one delivery: signs the event, POSTs it to the endpoint with a 10
 * second timeout and no redirects followed, and records the outcome.
 *
 * - a 2xx response is `succeeded`;
 * - if the endpoint was disabled after the delivery was queued, nothing is
 *   attempted and nothing is recorded (`due` stays leased and comes due again
 *   on the next poll, so a re-enabled endpoint resumes on its own schedule
 *   rather than needing a fresh attempt to be triggered by hand);
 * - the SSRF (server-side request forgery) guard is re-checked here, not only
 *   at creation, because the same hostname can resolve to a different address
 *   between the two (DNS rebinding); a refusal is treated exactly like a
 *   failed send;
 * - anything else (non-2xx, a timeout, a network error, or the SSRF recheck
 *   failing) retries on `WEBHOOK_RETRY_DELAYS_SECONDS` until
 *   `WEBHOOK_MAX_ATTEMPTS` is reached, then the delivery is marked `failed`.
 */
export async function attemptDelivery(db: Db, due: DueDelivery, deps: DeliverDeps): Promise<'delivered' | 'skipped_disabled' | 'retrying' | 'failed'> {
  if (!due.enabled) return 'skipped_disabled';

  const rawBody = JSON.stringify(due.payload);
  const fetchImpl = deps.fetchImpl ?? fetch;
  const startedAt = Date.now();

  let statusCode: number | null = null;
  let error: string | null = null;
  let responseSnippet: string | null = null;

  try {
    const url = new URL(due.url);
    await assertResolvesToPublicAddress(url.hostname, deps.policy);
    const secrets = validSecretsFor(due, deps.sealer);
    const headers = await buildWebhookHeaders(secrets, rawBody, due.payload);
    const response = await fetchImpl(due.url, {
      method: 'POST',
      headers,
      body: rawBody,
      redirect: 'manual',
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });
    statusCode = response.status;
    const text = await response.text().catch(() => '');
    responseSnippet = text.slice(0, RESPONSE_SNIPPET_MAX) || null;
    if (statusCode >= 200 && statusCode < 300) {
      await repos(db).webhookDeliveries.recordAttempt(due.workspace_id, due.id, {
        status: 'succeeded',
        statusCode,
        responseSnippet,
        durationMs: Date.now() - startedAt,
      });
      return 'delivered';
    }
    error = `endpoint replied with HTTP ${statusCode}`;
  } catch (err) {
    error = err instanceof Error && err.name === 'TimeoutError' ? `timed out after ${SEND_TIMEOUT_MS}ms` : String(err instanceof Error ? err.message : err);
  }

  const durationMs = Date.now() - startedAt;
  const attemptNumber = due.attempts + 1;
  if (attemptNumber >= WEBHOOK_MAX_ATTEMPTS) {
    await repos(db).webhookDeliveries.recordAttempt(due.workspace_id, due.id, {
      status: 'failed',
      statusCode,
      error: error ?? 'delivery failed',
      responseSnippet,
      durationMs,
    });
    return 'failed';
  }
  const delaySeconds = WEBHOOK_RETRY_DELAYS_SECONDS[Math.min(due.attempts, WEBHOOK_RETRY_DELAYS_SECONDS.length - 1)]!;
  await repos(db).webhookDeliveries.recordAttempt(due.workspace_id, due.id, {
    status: 'pending',
    statusCode,
    error: error ?? 'delivery failed',
    nextAttemptAt: new Date(Date.now() + delaySeconds * 1000),
    responseSnippet,
    durationMs,
  });
  return 'retrying';
}
