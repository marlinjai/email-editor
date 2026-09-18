import type { Context } from 'hono';
import type { z } from 'zod';
import { ApiError } from './errors.js';
import { DEFAULT_PAGE_LIMIT } from './schemas.js';

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

/** Parses and validates a JSON body. Malformed JSON is `invalid_request`, a wrong shape `validation_failed`. */
export async function jsonBody<T extends z.ZodTypeAny>(c: Context, schema: T): Promise<z.infer<T>> {
  const raw = await c.req.text();
  let value: unknown;
  try {
    value = raw.length === 0 ? undefined : JSON.parse(raw);
  } catch {
    throw new ApiError('invalid_request', 'The request body is not valid JSON.');
  }
  return check(schema, value, 'request body');
}

export function query<T extends z.ZodTypeAny>(c: Context, schema: T): z.infer<T> {
  return check(schema, c.req.query(), 'query string');
}

export function params<T extends z.ZodTypeAny>(c: Context, schema: T): z.infer<T> {
  return check(schema, c.req.param(), 'path');
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * Keyset pagination. The cursor is the id of the last row of the previous page,
 * and it must belong to the same workspace, or it is `invalid_cursor` rather
 * than a silently empty page.
 */
export async function pageArgs(
  q: { cursor?: string; limit?: number },
  cursorExists: (id: string) => Promise<boolean>,
): Promise<{ afterId?: string; limit: number }> {
  const limit = q.limit ?? DEFAULT_PAGE_LIMIT;
  if (q.cursor === undefined) return { limit };
  if (!UUID.test(q.cursor) || !(await cursorExists(q.cursor))) {
    throw new ApiError('invalid_cursor', 'The cursor is not valid for this list. Start again without one.');
  }
  return { afterId: q.cursor, limit };
}

/** Fetches one row more than asked, to know whether there is a next page without a count. */
export function toPage<T extends { id: string }>(rows: T[], limit: number): { data: T[]; next_cursor: string | null } {
  const data = rows.slice(0, limit);
  return { data, next_cursor: rows.length > limit ? data[data.length - 1]!.id : null };
}
