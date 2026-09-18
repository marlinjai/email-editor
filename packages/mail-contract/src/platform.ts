import { z } from 'zod';
import { Email, Id, JsonValue, Slug, Timestamp } from './common';
import { MailingCounts } from './mailings';

/*
 * S4, the platform features: contacts managed inside the service. Typed now so
 * S4 extends these shapes instead of inventing them; the routes are listed in
 * `platformRoutes` and are not served before S4 ships.
 */

// Tags

export const Tag = z.object({
  id: Id,
  slug: Slug,
  name: z.string().min(1).max(120),
  contact_count: z.number().int().min(0),
  created_at: Timestamp,
});
export type Tag = z.infer<typeof Tag>;

export const TagCreate = z.object({ slug: Slug, name: z.string().min(1).max(120) });
export type TagCreate = z.infer<typeof TagCreate>;

export const TagAssignment = z.object({
  contact_ids: z.array(Id).min(1).max(1000),
});
export type TagAssignment = z.infer<typeof TagAssignment>;

// Segments: saved filters over contacts

export const FILTER_OPERATORS = [
  'eq',
  'neq',
  'contains',
  'not_contains',
  'starts_with',
  'gt',
  'gte',
  'lt',
  'lte',
  'exists',
  'not_exists',
  'in',
  'not_in',
] as const;
export const FilterOperator = z.enum(FILTER_OPERATORS);
export type FilterOperator = z.infer<typeof FilterOperator>;

/**
 * A leaf condition. `field` is one of:
 * - `email`, `first_name`, `last_name`, `locale`, `created_at` (contact columns)
 * - `property:<key>` (a contact property)
 * - `tag` (value: a tag slug; `eq` has the tag, `neq` lacks it)
 * - `topic` (value: a topic slug; `eq` subscribed, `neq` not)
 * - `engagement:opened` / `engagement:clicked` (value: days; `lte` 30 means within
 *   the last 30 days), only with tracking enabled on the workspace
 */
export const FilterField = z
  .string()
  .regex(
    /^(email|first_name|last_name|locale|created_at|tag|topic|engagement:(opened|clicked)|property:[A-Za-z0-9_.-]{1,64})$/,
    'unknown filter field',
  );
export type FilterField = z.infer<typeof FilterField>;

export type FilterCondition = { field: string; op: FilterOperator; value?: JsonValue };
export type SegmentFilter =
  | { and: SegmentFilter[] }
  | { or: SegmentFilter[] }
  | { not: SegmentFilter }
  | FilterCondition;

export const MAX_FILTER_DEPTH = 5;

export const FilterCondition: z.ZodType<FilterCondition> = z
  .object({ field: FilterField, op: FilterOperator, value: JsonValue.optional() })
  .strict()
  .refine((c) => (c.op === 'exists' || c.op === 'not_exists') === (c.value === undefined), {
    message: 'exists and not_exists take no value; every other operator needs one',
    path: ['value'],
  })
  .refine((c) => (c.op !== 'in' && c.op !== 'not_in') || Array.isArray(c.value), {
    message: 'in and not_in take an array',
    path: ['value'],
  });

/** The filter AST: `and`, `or` and `not` over leaf conditions. */
export const SegmentFilter: z.ZodType<SegmentFilter> = z.lazy(() =>
  z.union([
    z.object({ and: z.array(SegmentFilter).min(1).max(50) }).strict(),
    z.object({ or: z.array(SegmentFilter).min(1).max(50) }).strict(),
    z.object({ not: SegmentFilter }).strict(),
    FilterCondition,
  ]),
);

export function filterDepth(filter: SegmentFilter): number {
  if ('and' in filter) return 1 + Math.max(...filter.and.map(filterDepth));
  if ('or' in filter) return 1 + Math.max(...filter.or.map(filterDepth));
  if ('not' in filter) return 1 + filterDepth(filter.not);
  return 1;
}

/** A filter within the depth the service evaluates. */
export const BoundedSegmentFilter = SegmentFilter.refine((f) => filterDepth(f) <= MAX_FILTER_DEPTH, {
  message: `nested deeper than ${MAX_FILTER_DEPTH} levels`,
});

export const Segment = z.object({
  id: Id,
  name: z.string().min(1).max(120),
  filter: SegmentFilter,
  /** Computed on read. */
  contact_count: z.number().int().min(0),
  created_at: Timestamp,
  updated_at: Timestamp,
});
export type Segment = z.infer<typeof Segment>;

export const SegmentCreate = z.object({ name: z.string().min(1).max(120), filter: BoundedSegmentFilter });
export type SegmentCreate = z.infer<typeof SegmentCreate>;

/** Queues every contact the segment matches at the moment of the call. */
export const MailingAudienceFromSegment = z.object({ segment_id: Id });
export type MailingAudienceFromSegment = z.infer<typeof MailingAudienceFromSegment>;

// Signup forms with double opt-in

export const SignupForm = z.object({
  id: Id,
  name: z.string().min(1).max(120),
  topics: z.array(Slug).min(1),
  tags: z.array(Slug),
  /** Fields shown besides email. */
  fields: z.array(z.enum(['first_name', 'last_name'])),
  double_opt_in: z.literal(true),
  confirmation_template_id: Id.nullable(),
  redirect_url: z.string().url().nullable(),
  /** Origins allowed to embed the form. */
  allowed_origins: z.array(z.string().url()).max(20),
  created_at: Timestamp,
  updated_at: Timestamp,
});
export type SignupForm = z.infer<typeof SignupForm>;

export const SignupFormCreate = SignupForm.omit({ id: true, created_at: true, updated_at: true, double_opt_in: true });
export type SignupFormCreate = z.infer<typeof SignupFormCreate>;

/** What the hosted form or the embed posts. Nothing is subscribed until the confirmation link is followed. */
export const SignupSubmission = z.object({
  email: Email,
  first_name: z.string().max(200).optional(),
  last_name: z.string().max(200).optional(),
  locale: z.string().min(2).max(35).optional(),
  /** Honeypot: must be empty. */
  website: z.string().max(0).optional(),
});
export type SignupSubmission = z.infer<typeof SignupSubmission>;

// CSV import

export const IMPORT_STATUSES = ['pending', 'running', 'completed', 'failed', 'cancelled'] as const;

export const ImportColumnMapping = z.record(
  z.string().regex(/^(email|external_id|first_name|last_name|locale|property:[A-Za-z0-9_.-]{1,64}|ignore)$/),
);

/**
 * Starting an import. The request is `multipart/form-data` with the CSV in the
 * `file` field and these options, as JSON, in the `options` field.
 */
export const IMPORT_FILE_FIELD = 'file';
export const IMPORT_OPTIONS_FIELD = 'options';
export const MAX_IMPORT_BYTES = 50 * 1024 * 1024;

export const ImportJobCreate = z.object({
  /** CSV header -> contact field. Exactly one column maps to `email`. */
  mapping: ImportColumnMapping.refine(
    (m) => Object.values(m).filter((v) => v === 'email').length === 1,
    'exactly one column maps to email',
  ),
  topics: z.array(Slug).max(100),
  tags: z.array(Slug).max(100),
  /** The importer states the people consented; the service records who said so. */
  consent_confirmed: z.literal(true),
});
export type ImportJobCreate = z.infer<typeof ImportJobCreate>;

export const ImportJob = z.object({
  id: Id,
  status: z.enum(IMPORT_STATUSES),
  total_rows: z.number().int().min(0).nullable(),
  created: z.number().int().min(0),
  updated: z.number().int().min(0),
  skipped_suppressed: z.number().int().min(0),
  errors: z.array(z.object({ row: z.number().int().min(1), message: z.string() })).max(1000),
  created_at: Timestamp,
  finished_at: Timestamp.nullable(),
});
export type ImportJob = z.infer<typeof ImportJob>;

// Scheduling

/**
 * Moves a `draft` mailing to `scheduled`. From there `send` starts it at once and
 * `cancel` ends it. `send_at` must lie in the future.
 */
export const MailingScheduleRequest = z.object({ send_at: Timestamp });
export type MailingScheduleRequest = z.infer<typeof MailingScheduleRequest>;

// A/B testing of subject and content

export const AbVariant = z.object({
  key: z.string().regex(/^[a-z]$/, 'a single lowercase letter'),
  subject: z.string().min(1).max(998).optional(),
  /** Replaces the mailing's document for this variant. */
  document: z.record(z.unknown()).optional(),
});
export type AbVariant = z.infer<typeof AbVariant>;

export const AbTestConfig = z
  .object({
    variants: z.array(AbVariant).min(2).max(5),
    /** Share of recipients in the test group, the rest get the winner. */
    test_fraction: z.number().gt(0).lte(1),
    winner_metric: z.enum(['opens', 'clicks']),
    decide_after_minutes: z.number().int().min(15).max(10_080),
  })
  .refine((c) => new Set(c.variants.map((v) => v.key)).size === c.variants.length, 'variant keys must be unique');
export type AbTestConfig = z.infer<typeof AbTestConfig>;

// Analytics (opt-in per workspace)

export const TrackingSettings = z.object({ opens: z.boolean(), clicks: z.boolean() });
export type TrackingSettings = z.infer<typeof TrackingSettings>;

export const MailingAnalytics = z.object({
  mailing_id: Id,
  counts: MailingCounts,
  /** Null when tracking was off for this mailing. */
  unique_opens: z.number().int().min(0).nullable(),
  unique_clicks: z.number().int().min(0).nullable(),
  unsubscribes: z.number().int().min(0),
  bounces: z.number().int().min(0),
  complaints: z.number().int().min(0),
  links: z.array(z.object({ url: z.string(), unique_clicks: z.number().int().min(0) })).nullable(),
  variants: z
    .array(z.object({ key: z.string(), sent: z.number().int().min(0), unique_opens: z.number().int().min(0).nullable() }))
    .nullable(),
});
export type MailingAnalytics = z.infer<typeof MailingAnalytics>;

export const ContactPropertyDefinition = z.object({
  key: z.string().regex(/^[A-Za-z0-9_.-]{1,64}$/),
  label: z.string().min(1).max(120),
  type: z.enum(['string', 'number', 'boolean', 'date']),
});
export type ContactPropertyDefinition = z.infer<typeof ContactPropertyDefinition>;
