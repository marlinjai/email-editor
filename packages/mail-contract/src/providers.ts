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

const ProviderFields = {
  name: z.string().min(1).max(120),
  from_name: z.string().min(1).max(120),
  from_email: Email,
  reply_to: Email.nullable(),
  policy: ProviderPolicy,
};

/** A provider as read. `has_secret` tells whether a credential is stored. */
export const Provider = z.discriminatedUnion('kind', [
  z.object({
    id: Id,
    kind: z.literal('smtp'),
    config: SmtpConfigBase,
    has_secret: z.boolean(),
    ...ProviderFields,
    created_at: Timestamp,
    updated_at: Timestamp,
  }),
  z.object({
    id: Id,
    kind: z.literal('resend'),
    config: ResendConfigBase,
    has_secret: z.boolean(),
    ...ProviderFields,
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
