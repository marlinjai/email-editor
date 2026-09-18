import { z } from 'zod';
import { Email, Id, PageQuery, Properties, Slug, Timestamp } from './common';

/*
 * S2: preference topics, contacts and suppressions.
 */

// Topics

export const Topic = z.object({
  id: Id,
  slug: Slug,
  name: z.string().min(1).max(120),
  /** Shown on the hosted preference page. */
  description: z.string().max(1000).nullable(),
  /** Translations of `name` and `description` per locale, for the hosted page. */
  translations: z.record(
    z.object({ name: z.string().min(1).max(120), description: z.string().max(1000).nullable() }),
  ),
  created_at: Timestamp,
  updated_at: Timestamp,
});
export type Topic = z.infer<typeof Topic>;

export const TopicCreate = z.object({
  slug: Slug,
  name: z.string().min(1).max(120),
  description: z.string().max(1000).optional(),
  translations: Topic.shape.translations.optional(),
});
export type TopicCreate = z.infer<typeof TopicCreate>;

export const TopicUpdate = TopicCreate.omit({ slug: true })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'at least one field');
export type TopicUpdate = z.infer<typeof TopicUpdate>;

// Contacts

/**
 * A contact is the client's person, copied minimally: the client stays the
 * system of record. `topics` lists the topic slugs the person is subscribed to.
 */
export const Contact = z.object({
  id: Id,
  external_id: z.string().min(1).max(255).nullable(),
  /** Stored lowercased, unique per workspace. */
  email: Email,
  first_name: z.string().max(200).nullable(),
  last_name: z.string().max(200).nullable(),
  locale: z.string().min(2).max(35).nullable(),
  properties: Properties,
  topics: z.array(Slug),
  /** The slugs of the contact's tags (S4). */
  tags: z.array(Slug),
  created_at: Timestamp,
  updated_at: Timestamp,
});
export type Contact = z.infer<typeof Contact>;

/**
 * Upsert. The contact is found by `external_id` when given, else by `email`.
 * Fields given replace the stored ones; `properties` is merged key by key (a key
 * set to null is removed). `topics`, when given, replaces the subscriptions, but
 * never re-subscribes a topic the person unsubscribed from through the hosted
 * page: suppressions win.
 */
export const ContactUpsert = z
  .object({
    external_id: z.string().min(1).max(255).optional(),
    email: Email.optional(),
    first_name: z.string().max(200).nullable().optional(),
    last_name: z.string().max(200).nullable().optional(),
    locale: z.string().min(2).max(35).nullable().optional(),
    properties: Properties.optional(),
    topics: z.array(Slug).max(100).optional(),
  })
  .refine((v) => v.external_id !== undefined || v.email !== undefined, {
    message: 'external_id or email is required',
    path: ['email'],
  });
export type ContactUpsert = z.infer<typeof ContactUpsert>;

/**
 * An upsert that creates a contact needs an email; the service answers
 * `validation_failed` if the `external_id` is new and no email was given.
 */
export const ContactUpsertResult = z.object({
  contact: Contact,
  created: z.boolean(),
});
export type ContactUpsertResult = z.infer<typeof ContactUpsertResult>;

export const ContactListQuery = PageQuery.extend({
  email: z.string().min(1).max(254).optional(),
  external_id: z.string().min(1).max(255).optional(),
  topic: Slug.optional(),
});
export type ContactListQuery = z.infer<typeof ContactListQuery>;

/**
 * Erasure (Art. 17 GDPR, the General Data Protection Regulation's right to be
 * forgotten): the contact, its recipient rows and the archived HTML sent to it are
 * deleted. Its suppressions stay, since forgetting a block would mean emailing
 * someone who asked not to be emailed.
 */
export const ContactErased = z.object({
  ok: z.literal(true),
  erased_messages: z.number().int().min(0),
  erased_recipients: z.number().int().min(0),
  suppressions_kept: z.number().int().min(0),
});
export type ContactErased = z.infer<typeof ContactErased>;

// Suppressions

export const SUPPRESSION_REASONS = ['unsubscribed', 'bounced', 'complained', 'manual'] as const;
export const SuppressionReason = z.enum(SUPPRESSION_REASONS);
export type SuppressionReason = z.infer<typeof SuppressionReason>;

/**
 * A block on an address, independent of contacts. `topic` null means every topic.
 * Checked by the worker at send time, whatever the client sends.
 */
export const Suppression = z.object({
  id: Id,
  email: Email,
  reason: SuppressionReason,
  topic: Slug.nullable(),
  source_message_id: Id.nullable(),
  note: z.string().max(1000).nullable(),
  created_at: Timestamp,
});
export type Suppression = z.infer<typeof Suppression>;

/** A client or a human may only add `manual` or `unsubscribed` blocks. */
export const SuppressionCreate = z.object({
  email: Email,
  reason: z.enum(['manual', 'unsubscribed']),
  topic: Slug.nullable().optional(),
  note: z.string().max(1000).optional(),
});
export type SuppressionCreate = z.infer<typeof SuppressionCreate>;

export const SuppressionListQuery = PageQuery.extend({
  email: z.string().min(1).max(254).optional(),
  reason: SuppressionReason.optional(),
  topic: Slug.optional(),
});
export type SuppressionListQuery = z.infer<typeof SuppressionListQuery>;
