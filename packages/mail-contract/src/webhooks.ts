import { z } from 'zod';
import { Email, Id, PageQuery, Slug, Timestamp } from './common';
import { MailingCounts, MailingMetadata } from './mailings';

/*
 * S2: webhook endpoints, deliveries, and the events the service sends to them.
 */

export const WEBHOOK_EVENT_TYPES = [
  'message.sent',
  'message.failed',
  'contact.unsubscribed',
  'contact.resubscribed',
  'contact.bounced',
  'mailing.finished',
] as const;
export const WebhookEventType = z.enum(WEBHOOK_EVENT_TYPES);
export type WebhookEventType = z.infer<typeof WebhookEventType>;

// Event payloads

const MessageEventBase = z.object({
  message_id: Id,
  mailing_id: Id.nullable(),
  mailing_metadata: MailingMetadata.nullable(),
  recipient_id: Id.nullable(),
  contact_id: Id.nullable(),
  external_id: z.string().nullable(),
  email: Email,
  subject: z.string(),
  topic: Slug.nullable(),
  provider_message_id: z.string().nullable(),
  is_test: z.boolean(),
});

export const MessageSentData = MessageEventBase.extend({
  /** The final HTML as sent, so the client can archive it beside its own records. */
  html: z.string(),
  sent_at: Timestamp,
});
export type MessageSentData = z.infer<typeof MessageSentData>;

export const MessageFailedData = MessageEventBase.extend({
  error: z.string(),
  /** False when the provider rejected permanently; the recipient will not be retried. */
  retryable: z.boolean(),
  failed_at: Timestamp,
});
export type MessageFailedData = z.infer<typeof MessageFailedData>;

export const UNSUBSCRIBE_SOURCES = ['hosted_page', 'one_click', 'api', 'dashboard'] as const;

export const ContactUnsubscribedData = z.object({
  contact_id: Id.nullable(),
  external_id: z.string().nullable(),
  email: Email,
  /** The topic unsubscribed from; null means every topic. */
  topic: Slug.nullable(),
  mailing_id: Id.nullable(),
  source: z.enum(UNSUBSCRIBE_SOURCES),
  unsubscribed_at: Timestamp,
});
export type ContactUnsubscribedData = z.infer<typeof ContactUnsubscribedData>;

/**
 * The person opted back in (only possible through the signed hosted page, or by a
 * client or member lifting their own `unsubscribed` block). The same shape as
 * `contact.unsubscribed`, so a mirror can apply both with one code path: `topic`
 * null means the block on every topic was lifted. Blocks for a bounce, a
 * complaint or a manual block are never lifted this way.
 */
export const ContactResubscribedData = ContactUnsubscribedData.omit({ unsubscribed_at: true }).extend({
  resubscribed_at: Timestamp,
});
export type ContactResubscribedData = z.infer<typeof ContactResubscribedData>;

export const ContactBouncedData = z.object({
  contact_id: Id.nullable(),
  external_id: z.string().nullable(),
  email: Email,
  /** `bounced` for a hard bounce, `complained` for a spam complaint. */
  reason: z.enum(['bounced', 'complained']),
  message_id: Id.nullable(),
  diagnostic: z.string().nullable(),
  bounced_at: Timestamp,
});
export type ContactBouncedData = z.infer<typeof ContactBouncedData>;

export const MailingFinishedData = z.object({
  mailing_id: Id,
  mailing_metadata: MailingMetadata,
  status: z.enum(['sent', 'partially_failed', 'cancelled']),
  counts: MailingCounts,
  finished_at: Timestamp,
});
export type MailingFinishedData = z.infer<typeof MailingFinishedData>;

const envelope = <T extends WebhookEventType, D extends z.ZodTypeAny>(type: T, data: D) =>
  z.object({
    /** Unique per event: a receiver deduplicates on it (deliveries may repeat). */
    id: Id,
    type: z.literal(type),
    created_at: Timestamp,
    workspace_id: Id,
    data,
  });

/** The body of every webhook request. */
export const WebhookEvent = z.discriminatedUnion('type', [
  envelope('message.sent', MessageSentData),
  envelope('message.failed', MessageFailedData),
  envelope('contact.unsubscribed', ContactUnsubscribedData),
  envelope('contact.resubscribed', ContactResubscribedData),
  envelope('contact.bounced', ContactBouncedData),
  envelope('mailing.finished', MailingFinishedData),
]);
export type WebhookEvent = z.infer<typeof WebhookEvent>;
export type WebhookEventOf<T extends WebhookEventType> = Extract<WebhookEvent, { type: T }>;

// Endpoints

export const WebhookEndpoint = z.object({
  id: Id,
  url: z.string().url(),
  description: z.string().max(500).nullable(),
  events: z.array(WebhookEventType).min(1),
  enabled: z.boolean(),
  created_at: Timestamp,
  updated_at: Timestamp,
});
export type WebhookEndpoint = z.infer<typeof WebhookEndpoint>;

/** Endpoints must be HTTPS, except for localhost during development. */
export const WebhookUrl = z
  .string()
  .url()
  .refine((u) => {
    try {
      const url = new URL(u);
      if (url.protocol === 'https:') return true;
      return url.protocol === 'http:' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1');
    } catch {
      return false;
    }
  }, 'must be https (http only for localhost)');

export const WebhookEndpointCreate = z.object({
  url: WebhookUrl,
  description: z.string().max(500).optional(),
  events: z.array(WebhookEventType).min(1),
  enabled: z.boolean().optional(),
});
export type WebhookEndpointCreate = z.infer<typeof WebhookEndpointCreate>;

export const WebhookEndpointUpdate = z
  .object({
    url: WebhookUrl,
    description: z.string().max(500).nullable(),
    events: z.array(WebhookEventType).min(1),
    enabled: z.boolean(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'at least one field');
export type WebhookEndpointUpdate = z.infer<typeof WebhookEndpointUpdate>;

/**
 * Returned on create and on secret rotation: the only time the signing secret is
 * shown. It starts with `WEBHOOK_SECRET_PREFIX`.
 */
export const WebhookEndpointWithSecret = z.object({
  endpoint: WebhookEndpoint,
  secret: z.string().min(32),
});
export type WebhookEndpointWithSecret = z.infer<typeof WebhookEndpointWithSecret>;

// Deliveries

export const WEBHOOK_DELIVERY_STATUSES = ['pending', 'succeeded', 'failed'] as const;
export const WebhookDeliveryStatus = z.enum(WEBHOOK_DELIVERY_STATUSES);
export type WebhookDeliveryStatus = z.infer<typeof WebhookDeliveryStatus>;

/** Attempts before a delivery is marked failed, and the backoff between them. */
export const WEBHOOK_MAX_ATTEMPTS = 8;
export const WEBHOOK_RETRY_DELAYS_SECONDS = [30, 120, 600, 1800, 3600, 7200, 21600] as const;

export const WebhookDelivery = z.object({
  id: Id,
  endpoint_id: Id,
  event_id: Id,
  event_type: WebhookEventType,
  status: WebhookDeliveryStatus,
  attempts: z.number().int().min(0),
  last_status_code: z.number().int().min(100).max(599).nullable(),
  last_error: z.string().nullable(),
  next_attempt_at: Timestamp.nullable(),
  delivered_at: Timestamp.nullable(),
  created_at: Timestamp,
});
export type WebhookDelivery = z.infer<typeof WebhookDelivery>;

export const WebhookDeliveryListQuery = PageQuery.extend({
  status: WebhookDeliveryStatus.optional(),
  event_type: WebhookEventType.optional(),
});
export type WebhookDeliveryListQuery = z.infer<typeof WebhookDeliveryListQuery>;

export const WebhookDeliveryParams = z.object({ id: Id, delivery_id: Id });
export type WebhookDeliveryParams = z.infer<typeof WebhookDeliveryParams>;
