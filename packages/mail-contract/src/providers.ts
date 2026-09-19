import { z } from 'zod';
import { Email, Id, Timestamp } from './common';

/*
 * S2: sending providers. The secret (SMTP password or Resend API key) is written
 * on create or update and never returned: the service stores it encrypted and a
 * read shows only whether one is set.
 */

export const PROVIDER_KINDS = ['smtp', 'resend'] as const;
export const ProviderKind = z.enum(PROVIDER_KINDS);
export type ProviderKind = z.infer<typeof ProviderKind>;

/**
 * The limits the worker enforces for one provider.
 * - `daily_recipient_budget`: recipients (To, CC and BCC) over a rolling 24 hours,
 *   transactional sends through the same provider included.
 * - `min_interval_ms`: the least time between two messages.
 * - `max_recipients_per_message`: always 1 for broadcasts.
 */
export const ProviderPolicy = z.object({
  daily_recipient_budget: z.number().int().min(1).max(10_000_000),
  min_interval_ms: z.number().int().min(0).max(3_600_000),
  max_recipients_per_message: z.number().int().min(1).max(1000),
});
export type ProviderPolicy = z.infer<typeof ProviderPolicy>;

/**
 * iCloud+ custom-domain mail, from Apple's published limits (1,000 messages and
 * recipients a day, 500 per message): kept below them on purpose.
 */
export const ICLOUD_SMTP_POLICY: ProviderPolicy = {
  daily_recipient_budget: 800,
  min_interval_ms: 3000,
  max_recipients_per_message: 1,
};

export const SMTP_SECURITY = ['tls', 'starttls'] as const;

const SmtpConfigBase = z.object({
  host: z.string().min(1).max(255),
  port: z.number().int().min(1).max(65535),
  /** `tls` connects encrypted (465), `starttls` upgrades (587). Never plaintext. */
  security: z.enum(SMTP_SECURITY),
  username: z.string().min(1).max(255),
});

const ResendConfigBase = z.object({});

/**
 * Permanent rejections the sender's side is at fault for: the receiving server
 * or the relay refused the sender (policy, relaying, authentication, reputation,
 * rate: SMTP 5.7.x; for Resend, an unverified domain or a refused key). They
 * never suppress the recipient. `count` is cumulative; `last_error` is the
 * latest reply as the provider gave it.
 */
export const ProviderRejections = z.object({
  count: z.number().int().min(0),
  last_error: z.string().nullable(),
  last_at: Timestamp.nullable(),
  /**
   * The last time the bounce circuit breaker tripped on one of this provider's
   * mailings: too many recipients of one run were refused as dead addresses
   * (five in a row with the same reply, or more than 20 percent of the first
   * 50), which points at the provider or the setup rather than the list. The
   * run's bounce blocks were undone and the mailing paused. `sample` is the
   * reply that tripped it.
   */
  anomaly: z
    .object({
      at: Timestamp,
      /** `mailing`: one mailing was paused. `provider`: 5 refusals in a row with the same reply across the provider's sends (test sends and one-recipient mailings included) within 24 hours. */
      scope: z.enum(['mailing', 'provider']),
      /**
       * True while the provider-wide breaker is open: no bounce blocks through
       * this provider, test sends refused and mailings not started or resumed
       * (`provider_anomaly`), until an admin clears it (`providers.clearAnomaly`).
       */
      blocking: z.boolean(),
      mailing_id: Id.nullable(),
      reason: z.string(),
      sample: z.string(),
    })
    .nullable(),
});
export type ProviderRejections = z.infer<typeof ProviderRejections>;

/**
 * Where a Resend provider's events (bounces, spam complaints) arrive, and
 * whether the service can check their signature.
 * - `status`: `active` once a signing secret is stored; `needs_secret` until then.
 * - `source`: `automatic` when the service registered the endpoint at Resend
 *   itself (on create or verify), `manual` when a member pasted the secret.
 * - `url`: the endpoint to register at Resend by hand when automatic
 *   registration is not possible (a sending-only API key).
 * - `error`: why the last automatic registration failed, if it did.
 * - `unmatched`: events for emails this provider did not send (see below).
 */
export const ProviderEvents = z.object({
  status: z.enum(['active', 'needs_secret']),
  source: z.enum(['automatic', 'manual']).nullable(),
  url: z.string().url(),
  error: z.string().nullable(),
  /**
   * Events that named an email this provider never sent through the service
   * (another workspace or system sharing the Resend account): counted, never
   * acted on.
   */
  unmatched: z.number().int().min(0),
});
export type ProviderEvents = z.infer<typeof ProviderEvents>;

/** The Resend event types the endpoint subscribes to. */
export const RESEND_EVENT_TYPES = ['email.bounced', 'email.complained', 'email.delivery_delayed'] as const;

/** A Svix signing secret as Resend shows it: `whsec_` and the base64 key. */
export const ResendSigningSecret = z
  .string()
  .max(200)
  .regex(/^whsec_[A-Za-z0-9+/]{16,}={0,2}$/, 'must be the signing secret Resend shows, starting with whsec_');

export const ProviderEventsSecret = z.object({ signing_secret: ResendSigningSecret });
export type ProviderEventsSecret = z.infer<typeof ProviderEventsSecret>;

const ProviderFields = {
  name: z.string().min(1).max(120),
  from_name: z.string().min(1).max(120),
  from_email: Email,
  reply_to: Email.nullable(),
  policy: ProviderPolicy,
};

/**
 * A provider as read. `has_secret` tells whether a credential is stored.
 *
 * Bounces: a hard bounce the SMTP server reports while the message is handed
 * over is detected for every kind. Bounces that arrive later as an email in the
 * sender's inbox (how iCloud+ and most SMTP servers report them) are not read,
 * so they are not detected. A Resend provider also reports later bounces and
 * spam complaints through `events`.
 */
export const Provider = z.discriminatedUnion('kind', [
  z.object({
    id: Id,
    kind: z.literal('smtp'),
    config: SmtpConfigBase,
    has_secret: z.boolean(),
    ...ProviderFields,
    rejections: ProviderRejections,
    created_at: Timestamp,
    updated_at: Timestamp,
  }),
  z.object({
    id: Id,
    kind: z.literal('resend'),
    config: ResendConfigBase,
    has_secret: z.boolean(),
    ...ProviderFields,
    rejections: ProviderRejections,
    events: ProviderEvents,
    created_at: Timestamp,
    updated_at: Timestamp,
  }),
]);
export type Provider = z.infer<typeof Provider>;

export const ProviderCreate = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('smtp'),
    config: SmtpConfigBase.extend({ password: z.string().min(1).max(1024) }),
    ...ProviderFields,
  }),
  z.object({
    kind: z.literal('resend'),
    config: ResendConfigBase.extend({ api_key: z.string().min(1).max(1024) }),
    ...ProviderFields,
  }),
]);
export type ProviderCreate = z.infer<typeof ProviderCreate>;

/**
 * Updating a provider. `kind` cannot change (create a new provider instead). The
 * secret is replaced only when given; omitting it keeps the stored one.
 */
export const ProviderUpdate = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('smtp'),
    config: SmtpConfigBase.extend({ password: z.string().min(1).max(1024).optional() }).partial().optional(),
    name: ProviderFields.name.optional(),
    from_name: ProviderFields.from_name.optional(),
    from_email: ProviderFields.from_email.optional(),
    reply_to: ProviderFields.reply_to.optional(),
    policy: ProviderPolicy.partial().optional(),
  }),
  z.object({
    kind: z.literal('resend'),
    config: ResendConfigBase.extend({ api_key: z.string().min(1).max(1024).optional() }).optional(),
    name: ProviderFields.name.optional(),
    from_name: ProviderFields.from_name.optional(),
    from_email: ProviderFields.from_email.optional(),
    reply_to: ProviderFields.reply_to.optional(),
    policy: ProviderPolicy.partial().optional(),
  }),
]);
export type ProviderUpdate = z.infer<typeof ProviderUpdate>;

/** Live usage against the policy, for the dashboard and for planning a send. */
export const ProviderUsage = z.object({
  provider_id: Id,
  recipients_last_24h: z.number().int().min(0),
  remaining_budget: z.number().int().min(0),
  /** When enough of the rolling window frees up to send again, if exhausted. */
  next_capacity_at: Timestamp.nullable(),
});
export type ProviderUsage = z.infer<typeof ProviderUsage>;

/** Checks the stored credentials by connecting, without sending anything. */
export const ProviderVerifyResult = z.object({
  ok: z.boolean(),
  error: z.string().nullable(),
});
export type ProviderVerifyResult = z.infer<typeof ProviderVerifyResult>;
