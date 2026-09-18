import { DEFAULT_PAGE_LIMIT, routes, type OperationId, type RouteDef } from '@marlinjai/mail-contract';
import type { Context } from 'hono';
import type { z } from 'zod';
import { ApiError } from './api-error.js';

function issues(error: z.ZodError) {
  return error.issues.map((i) => ({ path: i.path, message: i.message }));
}

function check<T extends z.ZodTypeAny>(schema: T, value: unknown, where: string): z.infer<T> {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new ApiError('validation_failed', `The ${where} is not valid.`, { issues: issues(parsed.error) });
  }
  return parsed.data;
}

type Def<K extends OperationId> = (typeof routes)[K];
type SchemaOf<K extends OperationId, F extends 'body' | 'query' | 'params'> = Def<K> extends Record<F, infer S extends z.ZodTypeAny>
  ? S
  : never;

function schemaOf(id: OperationId, field: 'body' | 'query' | 'params'): z.ZodTypeAny {
  const schema = (routes[id] as RouteDef)[field];
  if (!schema) throw new Error(`route ${id} declares no ${field}`);
  return schema;
}

/** The request body parsed as JSON, not yet validated. Malformed JSON is `invalid_request`. */
export async function rawJson(c: Context): Promise<unknown> {
  const raw = await c.req.text();
  try {
    return raw.length === 0 ? undefined : JSON.parse(raw);
  } catch {
    throw new ApiError('invalid_request', 'The request body is not valid JSON.');
  }
}

/** An already parsed body of operation `id`, validated against the contract. */
export function checkBody<K extends OperationId>(id: K, value: unknown): z.infer<SchemaOf<K, 'body'>> {
  return check(schemaOf(id, 'body'), value, 'request body');
}

/** The JSON body of operation `id`, validated against the contract. Malformed JSON is `invalid_request`. */
export async function body<K extends OperationId>(c: Context, id: K): Promise<z.infer<SchemaOf<K, 'body'>>> {
  return checkBody(id, await rawJson(c));
}

export function query<K extends OperationId>(c: Context, id: K): z.infer<SchemaOf<K, 'query'>> {
  return check(schemaOf(id, 'query'), c.req.query(), 'query string');
}

export function params<K extends OperationId>(c: Context, id: K): z.infer<SchemaOf<K, 'params'>> {
  return check(schemaOf(id, 'params'), c.req.param(), 'path');
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Ids are opaque strings in the contract; this service happens to issue UUIDs.
 * Anything else cannot name a row here, so it is `not_found`, exactly like a
 * well-formed id that does not exist, and it never reaches the database as a
 * failed cast.
 */
export function rowId(id: string, what: string): string {
  if (!UUID.test(id)) throw new ApiError('not_found', `No such ${what} in this workspace.`);
  return id.toLowerCase();
}

/**
 * Keyset pagination. The cursor is the id of the last row of the previous page,
 * and it must belong to the same list, or it is `invalid_cursor` rather than a
 * silently empty page.
 */
export async function pageArgs(
  q: { cursor?: string; limit?: number },
  cursorExists: (id: string) => Promise<boolean>,
): Promise<{ afterId?: string; limit: number }> {
  const limit = q.limit ?? DEFAULT_PAGE_LIMIT;
  if (q.cursor === undefined) return { limit };
  if (!UUID.test(q.cursor) || !(await cursorExists(q.cursor.toLowerCase()))) {
    throw new ApiError('invalid_cursor', 'The cursor is not valid for this list. Start again without one.');
  }
  return { afterId: q.cursor.toLowerCase(), limit };
}

/** Fetches one row more than asked, to know whether there is a next page without a count. */
export function toPage<T extends { id: string }>(rows: T[], limit: number): { data: T[]; next_cursor: string | null } {
  const data = rows.slice(0, limit);
  return { data, next_cursor: rows.length > limit ? data[data.length - 1]!.id : null };
}
