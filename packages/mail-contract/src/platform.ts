import { z } from 'zod';
import { Email, Id, JsonValue, PageQuery, Slug, Timestamp } from './common';
import { MailingCounts } from './mailings';

/*
 * S4, the platform features: contacts managed inside the service (tags, typed
 * custom properties, CSV import, hosted signup forms with double opt-in),
 * segments, scheduling and A/B tests on mailings, and campaign analytics with
 * open and click tracking, opt-in per workspace and off by default.
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

/** Adding or removing a tag on contacts. Idempotent: a contact that already has (or lacks) the tag is left as it is. */
export const TagAssignment = z.object({
  contact_ids: z.array(Id).min(1).max(1000),
});
export type TagAssignment = z.infer<typeof TagAssignment>;

// Custom contact properties

export const CONTACT_PROPERTY_TYPES = ['string', 'number', 'boolean', 'date'] as const;
export const ContactPropertyType = z.enum(CONTACT_PROPERTY_TYPES);
export type ContactPropertyType = z.infer<typeof ContactPropertyType>;

export const ContactPropertyKey = z.string().regex(/^[A-Za-z0-9_.-]{1,64}$/, 'letters, digits, dot, underscore and hyphen, 1 to 64');

/**
 * A typed property of the workspace's contacts. Once a key is defined, every
 * value written to it (contact upsert, CSV import, signup) must have its type,
 * or the write is `validation_failed`; `null` removes the value. A `date` is an
 * ISO 8601 date (`2026-09-18`) or timestamp. Keys without a definition stay
 * free-form JSON, as in S2. Segments compare a defined key by its type.
 */
export const ContactPropertyDefinition = z.object({
  key: ContactPropertyKey,
  label: z.string().min(1).max(120),
  type: ContactPropertyType,
});
export type ContactPropertyDefinition = z.infer<typeof ContactPropertyDefinition>;

export const ContactPropertyParams = z.object({ key: ContactPropertyKey });
export type ContactPropertyParams = z.infer<typeof ContactPropertyParams>;

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
 *   the last 30 days, `gt` 30 means not within them), only with tracking enabled
 *   on the workspace
 *
 * Which operators a field takes is listed in `FILTER_FIELD_OPERATORS`; the
 * service answers any other pair with `validation_failed`.
 */
export const FilterField = z
  .string()
  .regex(
    /^(email|first_name|last_name|locale|created_at|tag|topic|engagement:(opened|clicked)|property:[A-Za-z0-9_.-]{1,64})$/,
    'unknown filter field',
  );
export type FilterField = z.infer<typeof FilterField>;

/** The operators each field family accepts. `property:<key>` takes all of them. */
export const FILTER_FIELD_OPERATORS: Readonly<Record<string, readonly FilterOperator[]>> = {
  email: ['eq', 'neq', 'contains', 'not_contains', 'starts_with', 'in', 'not_in'],
  first_name: ['eq', 'neq', 'contains', 'not_contains', 'starts_with', 'exists', 'not_exists', 'in', 'not_in'],
  last_name: ['eq', 'neq', 'contains', 'not_contains', 'starts_with', 'exists', 'not_exists', 'in', 'not_in'],
  locale: ['eq', 'neq', 'starts_with', 'exists', 'not_exists', 'in', 'not_in'],
  created_at: ['gt', 'gte', 'lt', 'lte'],
  tag: ['eq', 'neq', 'in', 'not_in'],
  topic: ['eq', 'neq', 'in', 'not_in'],
  engagement: ['lte', 'gt'],
  property: FILTER_OPERATORS,
};

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

/** Counting what a filter matches before saving it. */
export const SegmentPreviewRequest = z.object({ filter: BoundedSegmentFilter });
export type SegmentPreviewRequest = z.infer<typeof SegmentPreviewRequest>;

export const SegmentPreview = z.object({
  contact_count: z.number().int().min(0),
  /** Up to five matching contacts, for a human to sanity-check the filter. */
  sample: z.array(z.object({ id: Id, email: Email })).max(5),
});
export type SegmentPreview = z.infer<typeof SegmentPreview>;

/**
 * Queues every contact the segment matches at the moment of the call that is
 * subscribed to the mailing's topic. Suppressions are still checked when each
 * message is sent.
 */
export const MailingAudienceFromSegment = z.object({ segment_id: Id });
export type MailingAudienceFromSegment = z.infer<typeof MailingAudienceFromSegment>;

// Signup forms with double opt-in

export const SIGNUP_FORM_FIELDS = ['first_name', 'last_name'] as const;

/** Per-locale copy of a form, for the hosted page's languages. */
export const SignupFormTranslation = z.object({
  title: z.string().min(1).max(120),
  consent_text: z.string().min(1).max(2000),
});
export type SignupFormTranslation = z.infer<typeof SignupFormTranslation>;

/**
 * A hosted signup form (`<service>/f/<id>`) and its embed. Nothing is
 * subscribed until the person follows the confirmation link sent through
 * `provider_id`; the confirmation records `consent_text` as shown, the form's
 * `version`, a hash of the address the request came from and the timestamps.
 */
export const SignupForm = z.object({
  id: Id,
  name: z.string().min(1).max(120),
  /** The heading of the hosted page. */
  title: z.string().min(1).max(120),
  /** What the person agrees to, shown above the button and recorded with the confirmation. */
  consent_text: z.string().min(1).max(2000),
  translations: z.record(SignupFormTranslation),
  topics: z.array(Slug).min(1),
  tags: z.array(Slug),
  /** Fields shown besides email. */
  fields: z.array(z.enum(SIGNUP_FORM_FIELDS)),
  double_opt_in: z.literal(true),
  /** The provider the confirmation mail is sent through. */
  provider_id: Id,
  /**
   * A saved template for the confirmation mail; it must contain
   * `{{confirm_url}}`. Null sends the built-in confirmation mail, localised.
   */
  confirmation_template_id: Id.nullable(),
  /** Where the person lands after confirming. Null shows the hosted confirmation page. */
  redirect_url: z.string().url().nullable(),
  /** Origins allowed to embed the form and call the submission route from a browser. */
  allowed_origins: z.array(z.string().url()).max(20),
  /** Bumped on every change; recorded with each confirmation. */
  version: z.number().int().min(1),
  created_at: Timestamp,
  updated_at: Timestamp,
});
export type SignupForm = z.infer<typeof SignupForm>;

export const SignupFormCreate = SignupForm.omit({
  id: true,
  created_at: true,
  updated_at: true,
  double_opt_in: true,
  version: true,
}).extend({
  translations: SignupForm.shape.translations.optional(),
  tags: SignupForm.shape.tags.optional(),
  fields: SignupForm.shape.fields.optional(),
  confirmation_template_id: Id.nullable().optional(),
  redirect_url: z.string().url().nullable().optional(),
  allowed_origins: SignupForm.shape.allowed_origins.optional(),
});
export type SignupFormCreate = z.infer<typeof SignupFormCreate>;

/** What a site needs to show the form: the hosted page, the no-JS embed markup and the optional script. */
export const SignupFormEmbed = z.object({
  hosted_url: z.string().url(),
  /** A plain HTML form posting to the hosted page; works without JavaScript. */
  html: z.string(),
  /** A small optional script that adds the time check and submits in place. */
  script_url: z.string().url(),
  /** Where a browser fetches a fresh `form_token` from (GET, public, CORS for `allowed_origins`). */
  token_url: z.string().url(),
});
export type SignupFormEmbed = z.infer<typeof SignupFormEmbed>;

/**
 * What the hosted form or the embed posts. Nothing is subscribed until the
 * confirmation link is followed, and the answer is the same whether or not the
 * address is already known, so the form discloses nobody's membership.
 */
export const SignupSubmission = z.object({
  email: Email,
  first_name: z.string().max(200).optional(),
  last_name: z.string().max(200).optional(),
  locale: z.string().min(2).max(35).optional(),
  /** Honeypot: must be empty. */
  website: z.string().max(0).optional(),
  /**
   * The signed render time from the form's token URL: a submission sooner than a
   * human could fill the form, or long after, is refused.
   */
  form_token: z.string().min(1).max(512),
});
export type SignupSubmission = z.infer<typeof SignupSubmission>;

// CSV import

/**
 * An import moves through upload, mapping (with a dry run), commit:
 * - `uploaded`: the file is parsed and stored row by row; `columns` and `sample`
 *   are known. Nothing is written to contacts.
 * - `validating`: a mapping was set; the dry run is running over every row.
 * - `validated`: `dry_run` says what a commit would do. Setting another mapping
 *   discards it and starts a new dry run (`mapping_version` goes up).
 * - `committing`: rows are written in batches, each batch in one transaction,
 *   so a crash resumes at the first unwritten row and never applies a row twice.
 * - `completed`, `failed`, `cancelled`: final. A cancel during the commit keeps
 *   the rows already written.
 */
export const IMPORT_STATUSES = ['uploaded', 'validating', 'validated', 'committing', 'completed', 'failed', 'cancelled'] as const;
export const ImportStatus = z.enum(IMPORT_STATUSES);
export type ImportStatus = z.infer<typeof ImportStatus>;

export const IMPORT_TERMINAL_STATUSES: readonly ImportStatus[] = ['completed', 'failed', 'cancelled'];

export const ImportColumnMapping = z.record(
  z.string().regex(/^(email|external_id|first_name|last_name|locale|property:[A-Za-z0-9_.-]{1,64}|ignore)$/),
);

export const IMPORT_FILE_FIELD = 'file';
export const MAX_IMPORT_BYTES = 50 * 1024 * 1024;
export const MAX_IMPORT_ROWS = 200_000;

/** Setting (or revising) the mapping; starts a new dry run. */
export const ImportMappingRequest = z.object({
  /** CSV header -> contact field. Exactly one column maps to `email`. */
  mapping: ImportColumnMapping.refine(
    (m) => Object.values(m).filter((v) => v === 'email').length === 1,
    'exactly one column maps to email',
  ),
  topics: z.array(Slug).max(100),
  tags: z.array(Slug).max(100),
  /** Existing contacts get the mapped fields overwritten; false only adds topics, tags and missing fields. */
  update_existing: z.boolean().optional(),
  /** The importer states the people consented; the service records who said so and when. */
  consent_confirmed: z.literal(true),
});
export type ImportMappingRequest = z.infer<typeof ImportMappingRequest>;

/** Committing exactly the dry run the caller saw: a newer mapping is `conflict`. */
export const ImportCommitRequest = z.object({ mapping_version: z.number().int().min(1) });
export type ImportCommitRequest = z.infer<typeof ImportCommitRequest>;

/**
 * What happened (or, in a dry run, would happen) to a row.
 * - `created`, `updated`: a contact was added or changed.
 * - `unchanged`: the contact already had every value, topic and tag (importing
 *   the same file again ends here for every row).
 * - `suppressed`: the address is blocked for every topic; nothing was written.
 *   An import never lifts a suppression or subscribes a blocked topic.
 * - `skipped`: the row was not used; `reason` says why.
 */
export const IMPORT_ROW_OUTCOMES = ['created', 'updated', 'unchanged', 'suppressed', 'skipped'] as const;
export const ImportRowOutcome = z.enum(IMPORT_ROW_OUTCOMES);
export type ImportRowOutcome = z.infer<typeof ImportRowOutcome>;

export const IMPORT_SKIP_REASONS = [
  'missing_email',
  'invalid_email',
  'duplicate_in_file',
  'invalid_value',
  'external_id_conflict',
  'wrong_column_count',
] as const;
export const ImportSkipReason = z.enum(IMPORT_SKIP_REASONS);
export type ImportSkipReason = z.infer<typeof ImportSkipReason>;

export const ImportReport = z.object({
  created: z.number().int().min(0),
  updated: z.number().int().min(0),
  unchanged: z.number().int().min(0),
  suppressed: z.number().int().min(0),
  skipped: z.number().int().min(0),
  skipped_by_reason: z.record(ImportSkipReason, z.number().int().min(0)),
  /** Rows whose contact was subscribed without some topic, because the address is blocked for it. */
  topics_withheld: z.number().int().min(0),
});
export type ImportReport = z.infer<typeof ImportReport>;

export const ImportJob = z.object({
  id: Id,
  status: ImportStatus,
  file_name: z.string().max(255).nullable(),
  file_bytes: z.number().int().min(0),
  total_rows: z.number().int().min(0),
  /** The header row, as in the file. */
  columns: z.array(z.string()),
  /** The first rows, for the mapping screen. */
  sample: z.array(z.array(z.string())).max(5),
  /** A mapping guessed from the headers, for the mapping screen to start from. */
  suggested_mapping: ImportColumnMapping,
  mapping: ImportColumnMapping.nullable(),
  mapping_version: z.number().int().min(0),
  topics: z.array(Slug),
  tags: z.array(Slug),
  update_existing: z.boolean(),
  /** The dry run of the current mapping; null before one finished. */
  dry_run: ImportReport.nullable(),
  /** What the commit has written so far; null before it started. */
  result: ImportReport.nullable(),
  /** Rows the current phase (dry run or commit) has processed. */
  processed_rows: z.number().int().min(0),
  /** Why a `failed` import failed. */
  error: z.string().nullable(),
  created_at: Timestamp,
  updated_at: Timestamp,
  finished_at: Timestamp.nullable(),
});
export type ImportJob = z.infer<typeof ImportJob>;

export const ImportRow = z.object({
  /** The line in the file, 1 being the first line after the header. */
  row: z.number().int().min(1),
  email: z.string().nullable(),
  outcome: ImportRowOutcome,
  reason: ImportSkipReason.nullable(),
  /** A human explanation for a skipped row (which value, which column). */
  message: z.string().nullable(),
  contact_id: Id.nullable(),
});
export type ImportRow = z.infer<typeof ImportRow>;

/**
 * Lists the rows of the dry run (while `validated`) or of the commit (once
 * committing or finished). The cursor is the last row number of the page.
 */
export const ImportRowListQuery = PageQuery.extend({ outcome: ImportRowOutcome.optional() });
export type ImportRowListQuery = z.infer<typeof ImportRowListQuery>;

// Scheduling

/**
 * Moves a `draft` mailing to `scheduled`, or moves a `scheduled` one to another
 * time. The same checks as `send` run now (it compiles, has
 * `{{unsubscribe_url}}` and recipients), so a scheduled mailing does not fail at
 * its time for a reason known today. `send_at` must lie in the future and within
 * a year. The worker starts it at that time; `send` starts it at once,
 * `unschedule` returns it to `draft`, `cancel` ends it.
 */
export const MailingScheduleRequest = z.object({ send_at: Timestamp });
export type MailingScheduleRequest = z.infer<typeof MailingScheduleRequest>;

// A/B testing of subject and content: in ./ab-test (the mailing embeds its state).

export * from './ab-test';

// Tracking and analytics (opt-in per workspace, off by default)

/**
 * Open and click tracking. Off by default. Setting it also sets the workspace's
 * `settings.tracking_enabled` to `opens || clicks`, which stays the master switch:
 * turned off through `workspace.update`, nothing is tracked whatever this says.
 * A mailing keeps the tracking it started with.
 */
export const TrackingSettings = z.object({ opens: z.boolean(), clicks: z.boolean() });
export type TrackingSettings = z.infer<typeof TrackingSettings>;

export const VariantAnalytics = z.object({
  key: z.string(),
  sent: z.number().int().min(0),
  unique_opens: z.number().int().min(0).nullable(),
  unique_clicks: z.number().int().min(0).nullable(),
});
export type VariantAnalytics = z.infer<typeof VariantAnalytics>;

export const MailingAnalytics = z.object({
  mailing_id: Id,
  counts: MailingCounts,
  /** What was tracked for this mailing, fixed when it started; null before it started. */
  tracking: TrackingSettings.nullable(),
  /** Unique recipients with a human open. Null when opens were not tracked. */
  unique_opens: z.number().int().min(0).nullable(),
  /**
   * Recipients whose only opens came from Apple Mail Privacy Protection, which
   * loads every image on delivery: counted apart, never as human opens.
   */
  apple_mpp_opens: z.number().int().min(0).nullable(),
  /** Opens and clicks from security scanners and prefetchers, filtered out of the unique counts. */
  machine_events: z.number().int().min(0).nullable(),
  unique_clicks: z.number().int().min(0).nullable(),
  unsubscribes: z.number().int().min(0),
  bounces: z.number().int().min(0),
  complaints: z.number().int().min(0),
  links: z.array(z.object({ url: z.string(), unique_clicks: z.number().int().min(0) })).nullable(),
  variants: z.array(VariantAnalytics).nullable(),
});
export type MailingAnalytics = z.infer<typeof MailingAnalytics>;
