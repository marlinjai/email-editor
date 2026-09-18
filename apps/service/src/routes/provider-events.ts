import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { z } from 'zod';
import { suppressBounce } from '../bounces.js';
import type { AppEnv } from '../context.js';
import type { Sql } from '../db.js';
import type { ProviderEventOutcome } from '../repo/provider-events.js';
import { repos } from '../repo/index.js';
import type { Sealer } from '../sealing.js';
import { verifySvix } from '../provider-events/svix.js';

/** Resend events are small; anything larger is not one. */
const MAX_EVENT_BYTES = 256 * 1024;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ADDRESS = z.string().trim().toLowerCase().email().max(254);

/**
 * The parts of a Resend event this service reads
 * (https://resend.com/docs/webhooks/event-types). Lenient on purpose: Resend
 * adds fields, and an event of a type this service does not act on is still
 * acknowledged.
 */
const ResendEvent = z.object({
  type: z.string().min(1).max(100),
  data: z
    .object({
      email_id: z.string().min(1).max(200).optional(),
      to: z.union([z.array(z.string()), z.string()]).optional(),
      bounce: z.object({ type: z.string().optional(), subType: z.string().optional(), message: z.string().optional() }).partial().optional(),
    })
    .passthrough(),
});
type ResendEvent = z.infer<typeof ResendEvent>;

/** What an event asks for: a block with this reason, or nothing. */
export function resendEventAction(event: ResendEvent): { reason: 'bounced' | 'complained'; diagnostic: string | null } | null {
  if (event.type === 'email.complained') return { reason: 'complained', diagnostic: 'The recipient marked the message as spam.' };
  if (event.type === 'email.bounced') {
    const bounce = event.data.bounce;
    // Only a permanent bounce is a hard bounce; a transient or undetermined one may deliver later.
    if (bounce?.type !== 'Permanent') return null;
    const detail = [bounce.subType, bounce.message].filter(Boolean).join(': ');
    return { reason: 'bounced', diagnostic: detail || 'Permanent bounce reported by Resend.' };
  }
  return null;
}

export type ProviderEventsDeps = {
  sealer: Sealer;
  log: Pick<Console, 'error' | 'log'>;
};

const ACTOR = (type: string) => ({ type: 'system' as const, reason: `Resend ${type}` });

/**
 * `POST /providers/:id/events/resend`: where Resend posts a provider's events.
 * Public and outside /v1, like the Stripe webhook: Resend holds no API key, the
 * signature is the credential.
 *
 * 1. The provider is found in any workspace by the id in the path; its
 *    workspace is the only one the event may change (tenancy: the signature
 *    checked with this provider's secret proves the event is this provider's).
 * 2. Fail closed: without a stored signing secret it answers 503, so Resend
 *    keeps the event and retries once the secret is set.
 * 3. The Svix signature is checked over the raw body exactly as received, with
 *    a five-minute timestamp tolerance: 400 when it fails.
 * 4. Exactly once: `svix-id` is claimed in `provider_events` in the same
 *    transaction as the block it causes. A retry or a replay changes nothing.
 * 5. `email.bounced` of type Permanent blocks the address as `bounced`,
 *    `email.complained` as `complained`, on every topic, and emits
 *    `contact.bounced`. The message is found by Resend's email id; when it is
 *    not (the event can outrun the worker recording the send, or the email was
 *    sent from the same Resend account by something else) the address the event
 *    names is blocked anyway, since a hard bounce or a complaint on the account
 *    hurts every sender on it. `email.delivery_delayed`, transient bounces and
 *    every other type are acknowledged and ignored.
 *
 * A processing failure answers 500, so Resend retries on its schedule.
 */
export function providerEventRoutes(sql: Sql, deps: ProviderEventsDeps) {
  const app = new Hono<AppEnv>();
  const { sealer, log } = deps;
  const tooLarge = bodyLimit({ maxSize: MAX_EVENT_BYTES, onError: (c) => c.json({ error: 'payload too large' }, 413) });

  app.post('/providers/:id/events/resend', tooLarge, async (c) => {
    const providerId = c.req.param('id');
    const provider = UUID.test(providerId) ? await repos(sql).providers.getForEvents(providerId) : null;
    if (!provider || provider.kind !== 'resend') return c.json({ error: 'no such provider' }, 404);
    if (!provider.events_secret_sealed) {
      log.error(`[provider-events] an event for provider ${provider.id} arrived, but no signing secret is stored for it`);
      return c.json({ error: 'events are not set up for this provider' }, 503);
    }

    const raw = await c.req.text();
    const headers = { id: c.req.header('svix-id'), timestamp: c.req.header('svix-timestamp'), signature: c.req.header('svix-signature') };
    const verdict = verifySvix(sealer.open(provider.events_secret_sealed), headers, raw);
    if (!verdict.ok) return c.json({ error: `invalid signature (${verdict.reason})` }, 400);
    const externalId = headers.id!;
    if (externalId.length > 200) return c.json({ error: 'invalid svix-id' }, 400);

    let event: ResendEvent;
    try {
      event = ResendEvent.parse(JSON.parse(raw));
    } catch {
      return c.json({ error: 'not a Resend event' }, 400);
    }
    const action = resendEventAction(event);
    const emailId = event.data.email_id ?? null;
    const workspaceId = provider.workspace_id;

    const result = (await sql.begin(async (tx) => {
      const r = repos(tx);
      const claimed = await r.providerEvents.claim(workspaceId, { providerId: provider.id, externalId, type: event.type, providerMessageId: emailId });
      if (!claimed) return { duplicate: true as const, outcome: await r.providerEvents.outcomeOf(provider.id, externalId) };
      let outcome: ProviderEventOutcome = 'ignored';
      if (action) {
        const message = emailId ? await r.messages.byProviderMessageId(workspaceId, provider.id, emailId) : null;
        const named = typeof event.data.to === 'string' ? [event.data.to] : (event.data.to ?? []);
        const parsed = named.length === 1 ? ADDRESS.safeParse(named[0]) : null;
        const address = message?.to ?? (parsed?.success ? parsed.data : undefined);
        if (address) {
          outcome = await suppressBounce(tx, workspaceId, {
            email: address,
            reason: action.reason,
            message: message ? { id: message.id, contact_id: message.contact_id } : null,
            diagnostic: action.diagnostic,
            actor: ACTOR(event.type),
          });
        } else {
          log.log(`[provider-events] ${event.type} ${externalId} for provider ${provider.id} names no single address; ignored`);
        }
        await r.providerEvents.setOutcome(workspaceId, provider.id, externalId, outcome);
      }
      return { duplicate: false as const, outcome };
    })) as { duplicate: boolean; outcome: ProviderEventOutcome | null };

    if (!result.duplicate) {
      if (!action) log.log(`[provider-events] ${event.type} ${externalId} for provider ${provider.id} acknowledged, nothing to do`);
      await repos(sql)
        .providerEvents.prune(provider.id)
        .catch((err) => log.error('[provider-events] pruning old event ids failed:', err));
    }
    return c.json({ ok: true, duplicate: result.duplicate, outcome: result.outcome });
  });

  return app;
}
