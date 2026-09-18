import { z } from 'zod';
import { Email, Id, PageQuery, Properties, Slug, Timestamp } from './common';
import { TemplateDocument } from './templates';

/*
 * S2: mailings, their recipients, and the archive of sent messages.
 */

// Mailing states and the actions that move between them

export const MAILING_STATUSES = [
  'draft',
  'scheduled',
  'sending',
  'paused',
  'sent',
  'partially_failed',
  'cancelled',
] as const;
export const MailingStatus = z.enum(MAILING_STATUSES);
export type MailingStatus = z.infer<typeof MailingStatus>;

export const MAILING_ACTIONS = ['send', 'schedule', 'pause', 'resume', 'cancel', 'retry-failed'] as const;
export const MailingAction = z.enum(MAILING_ACTIONS);
export type MailingAction = z.infer<typeof MailingAction>;

/**
 * Which action is allowed in which state. The service answers any other
 * combination with `mailing_invalid_state` (409); the dashboard enables its
 * buttons from the same table. `schedule` belongs to the S4 platform features.
 *
 * A mailing whose queue drains ends `sent` when every recipient was sent or
 * skipped for a policy reason, and `partially_failed` when at least one failed
 * or ended `outcome_unknown`. `retry-failed` requeues the failed ones (and, only
 * when asked, the `outcome_unknown` ones) and moves the mailing back to `sending`.
 */
export const MAILING_TRANSITIONS: Readonly<Record<MailingStatus, readonly MailingAction[]>> = {
  draft: ['send', 'schedule', 'cancel'],
  scheduled: ['send', 'cancel'],
  sending: ['pause', 'cancel'],
  paused: ['resume', 'cancel'],
  sent: [],
  partially_failed: ['retry-failed'],
  cancelled: [],
};

export function canTransition(status: MailingStatus, action: MailingAction): boolean {
  return MAILING_TRANSITIONS[status].includes(action);
}

/** States in which the content, topic, provider and recipients may still change. */
export const EDITABLE_MAILING_STATUSES: readonly MailingStatus[] = ['draft', 'scheduled'];

/** States the worker will never leave on its own. */
export const TERMINAL_MAILING_STATUSES: readonly MailingStatus[] = ['sent', 'cancelled'];

// Mailings

/**
 * Up to 20 string values the client attaches to a mailing (for ŌPUNTIA: who
 * created it and what kind of mailing it is). Echoed in every message webhook,
 * so the client can file the event without looking the mailing up.
 */
export const MailingMetadata = z
  .record(z.string().max(500))
  .refine((v) => Object.keys(v).length <= 20, 'at most 20 keys')
  .refine((v) => Object.keys(v).every((k) => k.length >= 1 && k.length <= 64), 'keys are 1 to 64 characters');
export type MailingMetadata = z.infer<typeof MailingMetadata>;

export const MailingCounts = z.object({
  total: z.number().int().min(0),
  queued: z.number().int().min(0),
  sending: z.number().int().min(0),
  sent: z.number().int().min(0),
  failed: z.number().int().min(0),
  skipped: z.number().int().min(0),
});
export type MailingCounts = z.infer<typeof MailingCounts>;

export const Mailing = z.object({
  id: Id,
  name: z.string().max(200).nullable(),
  subject: z.string().min(1).max(998),
  preheader: z.string().max(500).nullable(),
  /** The template the document was taken from, if any. The snapshot is what is sent. */
  template_id: Id.nullable(),
  document: TemplateDocument,
  topic: Slug,
  provider_id: Id,
  status: MailingStatus,
  counts: MailingCounts,
  metadata: MailingMetadata,
  scheduled_at: Timestamp.nullable(),
  started_at: Timestamp.nullable(),
  finished_at: Timestamp.nullable(),
  created_at: Timestamp,
  updated_at: Timestamp,
});
export type Mailing = z.infer<typeof Mailing>;

export const MailingSummary = Mailing.omit({ document: true });
export type MailingSummary = z.infer<typeof MailingSummary>;

const MailingContent = {
  name: z.string().max(200).optional(),
  subject: z.string().min(1).max(998),
  preheader: z.string().max(500).optional(),
  topic: Slug,
  provider_id: Id,
  metadata: MailingMetadata.optional(),
};

/**
 * A new mailing, in `draft`. The content is either a document or a saved
 * template (whose current version is snapshotted), never both. An unknown topic
 * or provider is `unknown_topic` or `unknown_provider` (422).
 */
export const MailingCreate = z
  .object({
    ...MailingContent,
    document: TemplateDocument.optional(),
    template_id: Id.optional(),
  })
  .refine((v) => (v.document === undefined) !== (v.template_id === undefined), {
    message: 'exactly one of document or template_id',
    path: ['document'],
  });
export type MailingCreate = z.infer<typeof MailingCreate>;

/** Changing a mailing that is still `draft` or `scheduled`. */
export const MailingUpdate = z
  .object({
    name: z.string().max(200).nullable().optional(),
    subject: MailingContent.subject.optional(),
    preheader: z.string().max(500).nullable().optional(),
    topic: Slug.optional(),
    provider_id: Id.optional(),
    metadata: MailingMetadata.optional(),
    document: TemplateDocument.optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'at least one field');
export type MailingUpdate = z.infer<typeof MailingUpdate>;

export const MailingListQuery = PageQuery.extend({
  status: MailingStatus.optional(),
  topic: Slug.optional(),
});
export type MailingListQuery = z.infer<typeof MailingListQuery>;

/**
 * Starting a mailing. The service refuses with `missing_unsubscribe_url` (422)
 * when the compiled document has no `{{unsubscribe_url}}`, `compile_failed` (422)
 * when it does not compile cleanly, and `mailing_not_ready` (422) when it has no
 * recipients.
 */
export const MailingSendRequest = z.object({}).strict();
export type MailingSendRequest = z.infer<typeof MailingSendRequest>;

export const MailingRetryFailedRequest = z
  .object({
    /**
     * Also requeue recipients whose outcome is unknown after a crash. They may
     * already have received the message, so this is a human's decision, never a
     * default.
     */
    include_outcome_unknown: z.boolean().optional(),
  })
  .strict();
export type MailingRetryFailedRequest = z.infer<typeof MailingRetryFailedRequest>;

/** Pause, resume and cancel take no options. */
export const MailingActionRequest = z.object({}).strict();
export type MailingActionRequest = z.infer<typeof MailingActionRequest>;

/**
 * A test send to one named address, outside the queue and the recipient list,
 * archived as a test message. Merge values default to the address's contact, if
 * any; the unsubscribe link in a test points at a page that changes nothing.
 */
export const MailingTestRequest = z.object({
  to: Email,
  merge: Properties.optional(),
});
export type MailingTestRequest = z.infer<typeof MailingTestRequest>;

export const MailingTestResult = z.object({
  message_id: Id,
  provider_message_id: z.string().nullable(),
});
export type MailingTestResult = z.infer<typeof MailingTestResult>;

// Recipients

export const RECIPIENT_STATUSES = ['queued', 'sending', 'sent', 'failed', 'skipped'] as const;
export const RecipientStatus = z.enum(RECIPIENT_STATUSES);
export type RecipientStatus = z.infer<typeof RecipientStatus>;

/**
 * Why a recipient was not sent to.
 * - `suppressed`: the address is blocked for all topics or this topic.
 * - `not_subscribed`: the contact is not subscribed to the mailing's topic.
 * - `contact_erased`: the contact was erased while queued.
 * - `cancelled`: the mailing was cancelled while the recipient was queued.
 * - `outcome_unknown`: the worker crashed mid-send and no archived message shows
 *   whether the provider accepted it. Never retried automatically, since a
 *   duplicate cannot be unsent; see `include_outcome_unknown`.
 */
export const SKIP_REASONS = ['suppressed', 'not_subscribed', 'contact_erased', 'cancelled', 'outcome_unknown'] as const;
export const SkipReason = z.enum(SKIP_REASONS);
export type SkipReason = z.infer<typeof SkipReason>;

export const Recipient = z.object({
  id: Id,
  mailing_id: Id,
  contact_id: Id.nullable(),
  email: Email,
  merge: Properties,
  status: RecipientStatus,
  skip_reason: SkipReason.nullable(),
  attempts: z.number().int().min(0),
  message_id: Id.nullable(),
  last_error: z.string().nullable(),
  created_at: Timestamp,
  updated_at: Timestamp,
});
export type Recipient = z.infer<typeof Recipient>;

export const MAX_RECIPIENTS_PER_BATCH = 1000;

/**
 * One recipient in a batch. The contact is found by `contact_id`, else
 * `external_id`, else `email`; an email with no contact creates one. `merge`
 * holds this recipient's merge values (`first_name` and any client field).
 */
export const RecipientInput = z
  .object({
    contact_id: Id.optional(),
    external_id: z.string().min(1).max(255).optional(),
    email: Email.optional(),
    merge: Properties.optional(),
  })
  .refine((v) => v.contact_id !== undefined || v.external_id !== undefined || v.email !== undefined, {
    message: 'contact_id, external_id or email is required',
    path: ['email'],
  });
export type RecipientInput = z.infer<typeof RecipientInput>;

/** Adding recipients: idempotent on the email address within the mailing. */
export const RecipientBatch = z.object({
  recipients: z.array(RecipientInput).min(1).max(MAX_RECIPIENTS_PER_BATCH),
});
export type RecipientBatch = z.infer<typeof RecipientBatch>;

export const RECIPIENT_REJECTIONS = ['unknown_contact', 'duplicate_in_batch'] as const;

export const RecipientBatchResult = z.object({
  /** Newly queued. */
  added: z.number().int().min(0),
  /** Already on the mailing from an earlier batch: left unchanged. */
  already_present: z.number().int().min(0),
  /** Items not added, by their index in the request. */
  rejected: z.array(z.object({ index: z.number().int().min(0), reason: z.enum(RECIPIENT_REJECTIONS) })),
});
export type RecipientBatchResult = z.infer<typeof RecipientBatchResult>;

export const RecipientListQuery = PageQuery.extend({
  status: RecipientStatus.optional(),
  skip_reason: SkipReason.optional(),
});
export type RecipientListQuery = z.infer<typeof RecipientListQuery>;

// Messages (the sent archive)

export const MESSAGE_OUTCOMES = ['sent', 'failed'] as const;
export const MessageOutcome = z.enum(MESSAGE_OUTCOMES);
export type MessageOutcome = z.infer<typeof MessageOutcome>;

export const MessageSummary = z.object({
  id: Id,
  mailing_id: Id.nullable(),
  recipient_id: Id.nullable(),
  contact_id: Id.nullable(),
  to: Email,
  subject: z.string(),
  provider_id: Id,
  provider_message_id: z.string().nullable(),
  outcome: MessageOutcome,
  error: z.string().nullable(),
  is_test: z.boolean(),
  recipient_count: z.number().int().min(1),
  created_at: Timestamp,
});
export type MessageSummary = z.infer<typeof MessageSummary>;

/** One archived message with the final HTML exactly as sent. */
export const Message = MessageSummary.extend({ html: z.string() });
export type Message = z.infer<typeof Message>;

export const MessageListQuery = PageQuery.extend({
  mailing_id: Id.optional(),
  outcome: MessageOutcome.optional(),
});
export type MessageListQuery = z.infer<typeof MessageListQuery>;
