import {
  WEBHOOK_EVENT_ID_HEADER,
  WEBHOOK_SIGNATURE_HEADER,
  WEBHOOK_TIMESTAMP_HEADER,
  nowSeconds,
  signWebhook,
  type WebhookEvent,
} from '@marlinjai/mail-contract';
import type { DueDelivery } from '../repo/webhooks.js';
import type { Sealer } from '../sealing.js';

/**
 * The secrets currently valid for signing a delivery to `endpoint`: the
 * current one always, plus the previous one while its rotation window has not
 * expired (`repo/webhooks.ts` `rotateSecret`, `secret.ts`
 * `WEBHOOK_SECRET_ROTATION_WINDOW_MS`).
 */
export function validSecretsFor(due: Pick<DueDelivery, 'secret_sealed' | 'previous_secret_sealed' | 'previous_secret_expires_at'>, sealer: Sealer, now: Date = new Date()): string[] {
  const secrets = [sealer.open(due.secret_sealed)];
  if (due.previous_secret_sealed && due.previous_secret_expires_at && new Date(due.previous_secret_expires_at).getTime() > now.getTime()) {
    secrets.push(sealer.open(due.previous_secret_sealed));
  }
  return secrets;
}

/**
 * Builds the headers of an outgoing webhook request. During a rotation window
 * `x-mail-signature` carries one comma-separated `v1=` value per valid secret
 * (`packages/mail-contract/src/webhook-signing.ts` `verifyWebhook` accepts any
 * one of them); a receiver that has not yet rotated its own copy still
 * verifies.
 */
export async function buildWebhookHeaders(secrets: string[], rawBody: string, event: WebhookEvent): Promise<Record<string, string>> {
  const timestamp = nowSeconds();
  const signatures = await Promise.all(secrets.map((secret) => signWebhook(secret, rawBody, timestamp)));
  return {
    'content-type': 'application/json',
    [WEBHOOK_SIGNATURE_HEADER]: signatures.map((s) => s.signature).join(','),
    [WEBHOOK_TIMESTAMP_HEADER]: String(timestamp),
    [WEBHOOK_EVENT_ID_HEADER]: event.id,
  };
}
