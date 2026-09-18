import { z } from 'zod';

/**
 * Building blocks shared by every resource.
 *
 * Ids are opaque strings: the service chooses the generator, clients never parse
 * them. Timestamps are ISO 8601 strings with an offset (the database returns
 * `timestamptz`), never `Date` objects, so every schema is plain JSON on the wire.
 *
 * Request schemas validate and never transform, so `z.input` and `z.infer` of a
 * request are the same type. Normalisation (lowercasing an email, trimming) is
 * the service's job and is documented on the field.
 */

export const Id = z.string().min(1).max(64);
export type Id = z.infer<typeof Id>;

export const Timestamp = z.string().datetime({ offset: true });
export type Timestamp = z.infer<typeof Timestamp>;

/** An email address. The service lowercases it before storing or comparing. */
export const Email = z.string().trim().min(3).max(254).email();
export type Email = z.infer<typeof Email>;

/** A lowercase, url-safe identifier chosen by the client (topics, tags). */
export const Slug = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'lowercase letters, digits and single hyphens');
export type Slug = z.infer<typeof Slug>;

/** Free-form JSON properties attached to a contact or a recipient. */
export const JsonValue: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(JsonValue), z.record(JsonValue)]),
);
export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export const Properties = z.record(JsonValue);
export type Properties = z.infer<typeof Properties>;

export const DEFAULT_PAGE_LIMIT = 50;
export const MAX_PAGE_LIMIT = 100;

/**
 * Cursor pagination query. `cursor` is the `next_cursor` of the previous page,
 * opaque to the client. `limit` arrives as a string in a query string, so it is
 * accepted as either and validated as an integer in range.
 */
export const PageQuery = z.object({
  cursor: z.string().min(1).max(512).optional(),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_LIMIT).optional(),
});
export type PageQuery = z.infer<typeof PageQuery>;

/** A page of results. `next_cursor` is null on the last page. */
export function page<T extends z.ZodTypeAny>(item: T) {
  return z.object({
    data: z.array(item),
    next_cursor: z.string().nullable(),
  });
}
export type Page<T> = { data: T[]; next_cursor: string | null };

/** Path parameters for routes addressed by one id. */
export const IdParams = z.object({ id: Id });
export type IdParams = z.infer<typeof IdParams>;

/** Response of a delete or of an action that returns nothing else. */
export const Ok = z.object({ ok: z.literal(true) });
export type Ok = z.infer<typeof Ok>;
