import type { Sql } from '../db.js';
import { repos } from '../repo/index.js';
import type { Sealer } from '../sealing.js';
import { attemptDelivery, type DeliverDeps } from './deliver.js';
import type { SsrfPolicy } from './ssrf.js';

export type WebhookLoopOptions = {
  /** How many pending deliveries one poll claims at once. */
  batchSize?: number;
  /** How long a claimed delivery stays leased before it is due again if the process dies mid-send. */
  leaseSeconds?: number;
  /** How long to wait, when a poll found nothing to do, before polling again. */
  idlePollMs?: number;
  policy?: SsrfPolicy;
  fetchImpl?: typeof fetch;
  /** Overrides the per-send timeout; tests only. */
  timeoutMs?: number;
  log?: Pick<Console, 'error'>;
};

export type WebhookLoop = {
  /** Stops after the in-flight batch finishes; safe to call more than once. */
  stop(): Promise<void>;
};

/**
 * The webhook delivery loop: claims due deliveries with
 * `webhookDeliveries.claimDueForWorker` and attempts each with
 * `attemptDelivery` (`src/webhooks/deliver.ts`), concurrently within a batch.
 * Runs continuously until `stop()`; `main.ts` starts it at boot and stops it on
 * SIGTERM, letting the in-flight batch finish rather than cutting it off (an
 * in-flight HTTP request left running past process exit could deliver twice
 * with no record of it here).
 */
export function startWebhookDeliveryLoop(sql: Sql, sealer: Sealer, options: WebhookLoopOptions = {}): WebhookLoop {
  const batchSize = options.batchSize ?? 20;
  const leaseSeconds = options.leaseSeconds ?? 30;
  const idlePollMs = options.idlePollMs ?? 1000;
  const log = options.log ?? console;
  const deliverDeps: DeliverDeps = { sealer, policy: options.policy, fetchImpl: options.fetchImpl, timeoutMs: options.timeoutMs };

  let stopped = false;
  let resolveIdle: (() => void) | null = null;
  const done = (async () => {
    while (!stopped) {
      let claimed: number;
      try {
        const due = await repos(sql).webhookDeliveries.claimDueForWorker(batchSize, leaseSeconds);
        claimed = due.length;
        await Promise.all(
          due.map(async (delivery) => {
            try {
              await attemptDelivery(sql, delivery, deliverDeps);
            } catch (err) {
              log.error?.(`[webhooks] delivery ${delivery.id} threw outside attemptDelivery:`, err);
            }
          }),
        );
      } catch (err) {
        log.error?.('[webhooks] claim failed:', err);
        claimed = 0;
      }
      if (stopped) break;
      if (claimed === 0 || claimed < batchSize) {
        await new Promise<void>((resolve) => {
          resolveIdle = resolve;
          setTimeout(resolve, idlePollMs).unref();
        });
        resolveIdle = null;
      }
    }
  })();

  return {
    async stop() {
      if (stopped) return done;
      stopped = true;
      resolveIdle?.();
      return done;
    },
  };
}
