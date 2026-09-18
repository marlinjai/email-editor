import { randomBytes } from 'node:crypto';
import { WEBHOOK_SECRET_PREFIX } from '@marlinjai/mail-contract';

/**
 * How long, after a rotation, the previous secret keeps signing alongside the
 * new one (`repo/webhooks.ts` `rotateSecret`). A receiver has this long to pick
 * up the rotated secret before the old one stops being accepted.
 */
export const WEBHOOK_SECRET_ROTATION_WINDOW_MS = 24 * 60 * 60 * 1000;

/** A fresh signing secret: `whsec_` plus 32 random bytes as base64url. Shown once, then only sealed. */
export function generateWebhookSecret(): string {
  return `${WEBHOOK_SECRET_PREFIX}${randomBytes(32).toString('base64url')}`;
}
