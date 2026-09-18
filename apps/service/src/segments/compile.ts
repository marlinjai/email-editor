import {
  FILTER_FIELD_OPERATORS,
  Slug,
  Timestamp,
  type ContactPropertyType,
  type FilterCondition,
  type FilterOperator,
  type SegmentFilter,
  type ValidationIssue,
} from '@marlinjai/mail-contract';
import type postgres from 'postgres';
import { ApiError } from '../api-error.js';
import type { Db } from '../db.js';

/**
 * Compiles the contract's segment filter AST to a SQL boolean expression over
 * `contacts c`, as a postgres.js fragment.
 *
 * Nothing from the request is ever spliced into SQL text: field names select a
 * branch of a fixed switch, and every value and every property key is a bound
 * parameter of a tagged template. In-lists travel as one JSON parameter that
 * Postgres unpacks with `jsonb_array_elements_text`. Each leaf is wrapped in
 * `COALESCE(..., false)`, so a missing value is "no match" and `not` inverts it
 * cleanly instead of turning it into NULL.
 *
 * Before compiling, `checkFilter` validates what the schema cannot: which
 * operators a field takes (`FILTER_FIELD_OPERATORS`), the type of each value,
 * and the length of in-lists. Every problem is reported with the path of the
 * offending node under `filter`.
 */

export type Fragment = postgres.PendingQuery<postgres.Row[]>;

export type CompileContext = {
  db: Db;
  workspaceId: string;
  /** The workspace's property definitions. */
  types: ReadonlyMap<string, ContactPropertyType>;
};

export const MAX_IN_LIST = 500;
export const MAX_ENGAGEMENT_DAYS = 3650;

type Path = (string | number)[];

const DATE_PREFIX = /^\d{4}-\d{2}-\d{2}/;

function family(field: string): string {
  if (field.startsWith('property:')) return 'property';
  if (field.startsWith('engagement:')) return 'engagement';
  return field;
}

const isScalar = (v: unknown) => typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean';
const isString = (v: unknown): v is string => typeof v === 'string';
const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** The engagement kinds a filter uses, so the caller can check tracking once. */
export function engagementKinds(filter: SegmentFilter): Set<'open' | 'click'> {
  const out = new Set<'open' | 'click'>();
  const walk = (f: SegmentFilter) => {
    if ('and' in f) f.and.forEach(walk);
    else if ('or' in f) f.or.forEach(walk);
    else if ('not' in f) walk(f.not);
    else if (f.field === 'engagement:opened') out.add('open');
    else if (f.field === 'engagement:clicked') out.add('click');
  };
  walk(filter);
  return out;
}

/** Validates operators and values; throws `validation_failed` with every issue found. */
export function checkFilter(filter: SegmentFilter, types: ReadonlyMap<string, ContactPropertyType>, root: Path = ['filter']): void {
  const issues: ValidationIssue[] = [];
  const walk = (f: SegmentFilter, path: Path) => {
    if ('and' in f) return f.and.forEach((g, i) => walk(g, [...path, 'and', i]));
    if ('or' in f) return f.or.forEach((g, i) => walk(g, [...path, 'or', i]));
    if ('not' in f) return walk(f.not, [...path, 'not']);
    const problem = leafProblem(f, types);
    if (problem) issues.push({ path: [...path, problem.at === 'op' ? 'op' : 'value'], message: problem.message });
  };
  walk(filter, root);
  if (issues.length > 0) throw new ApiError('validation_failed', 'The segment filter is not valid.', { issues });
}

function leafProblem(c: FilterCondition, types: ReadonlyMap<string, ContactPropertyType>): { at: 'op' | 'value'; message: string } | null {
  const fam = family(c.field);
  const allowed = FILTER_FIELD_OPERATORS[fam];
  if (!allowed || !allowed.includes(c.op)) {
    return { at: 'op', message: `${c.field} does not take ${c.op}; it takes ${(allowed ?? []).join(', ')}` };
  }
  if (c.op === 'exists' || c.op === 'not_exists') return null;
  const list = c.op === 'in' || c.op === 'not_in';
  const values = list ? (c.value as unknown[]) : [c.value];
  if (list && (values.length === 0 || values.length > MAX_IN_LIST)) {
    return { at: 'value', message: `in and not_in take 1 to ${MAX_IN_LIST} values` };
  }
  const every = (ok: (v: unknown) => boolean, what: string) => (values.every(ok) ? null : { at: 'value' as const, message: `${c.field} ${c.op} needs ${what}` });

  switch (fam) {
    case 'email':
    case 'first_name':
    case 'last_name':
    case 'locale':
      return every((v) => isString(v) && v.length >= 1 && v.length <= 254, 'strings of 1 to 254 characters');
    case 'created_at':
      return every((v) => isString(v) && Timestamp.safeParse(v).success, 'an ISO 8601 timestamp with an offset');
    case 'tag':
    case 'topic':
      return every((v) => Slug.safeParse(v).success, 'slugs');
    case 'engagement':
      return every((v) => Number.isInteger(v) && (v as number) >= 1 && (v as number) <= MAX_ENGAGEMENT_DAYS, `a whole number of days from 1 to ${MAX_ENGAGEMENT_DAYS}`);
    case 'property': {
      const type = types.get(c.field.slice('property:'.length));
      const textOp = c.op === 'contains' || c.op === 'not_contains' || c.op === 'starts_with';
      const orderOp = c.op === 'gt' || c.op === 'gte' || c.op === 'lt' || c.op === 'lte';
      switch (type) {
        case 'number':
          if (textOp) return { at: 'op', message: `${c.field} is a number; ${c.op} compares text` };
          return every(isNumber, 'numbers');
        case 'boolean':
          if (textOp || orderOp || list) return { at: 'op', message: `${c.field} is a boolean; it takes eq, neq, exists and not_exists` };
          return every((v) => typeof v === 'boolean', 'true or false');
        case 'date':
          if (textOp) return { at: 'op', message: `${c.field} is a date; ${c.op} compares text` };
          return every((v) => isString(v) && DATE_PREFIX.test(v) && !Number.isNaN(Date.parse(v.slice(0, 10))), 'ISO 8601 dates');
        case 'string':
          if (orderOp) return { at: 'op', message: `${c.field} is a string; it cannot be ordered` };
          return every((v) => isString(v) && v.length <= 1000, 'strings of up to 1000 characters');
        case undefined:
          if (textOp) return every((v) => isString(v) && v.length <= 1000, 'strings of up to 1000 characters');
          if (orderOp) return every(isNumber, 'numbers (define the property to compare dates)');
          return every((v) => isScalar(v) || v === null, 'strings, numbers, booleans or null');
      }
    }
  }
  return { at: 'op', message: `unknown field ${c.field}` };
}

/** Escapes a value for ILIKE with `ESCAPE '\'`: the value matches itself, never a pattern. */
export function likeEscape(value: string): string {
  return value.replace(/[\\%_]/g, (m) => `\\${m}`);
}

/**
 * The boolean expression for `filter`. Call `checkFilter` first; this function
 * assumes a valid filter and throws on anything else rather than guessing.
 */
export function compileFilter(ctx: CompileContext, filter: SegmentFilter): Fragment {
  const { db } = ctx;
  if ('and' in filter) return join(db, filter.and.map((f) => compileFilter(ctx, f)), 'AND');
  if ('or' in filter) return join(db, filter.or.map((f) => compileFilter(ctx, f)), 'OR');
  if ('not' in filter) return db`(NOT ${compileFilter(ctx, filter.not)})`;
  return db`COALESCE((${leaf(ctx, filter)}), false)`;
}

function join(db: Db, parts: Fragment[], op: 'AND' | 'OR'): Fragment {
  let out = db`(${parts[0]!}`;
  for (const p of parts.slice(1)) out = op === 'AND' ? db`${out} AND ${p}` : db`${out} OR ${p}`;
  return db`${out})`;
}

/** A JSON array parameter, unpacked in SQL as text values. */
function listJson(db: Db, values: unknown[]) {
  return db.json(values as postgres.JSONValue);
}

function textColumn(db: Db, field: string): Fragment {
  switch (field) {
    case 'email':
      return db`c.email`;
    case 'first_name':
      return db`c.first_name`;
    case 'last_name':
      return db`c.last_name`;
    case 'locale':
      return db`c.locale`;
  }
  throw new Error(`not a text column: ${field}`);
}

/** Case-insensitive text operators over an expression that may be NULL. */
function textCompare(db: Db, col: Fragment, op: FilterOperator, value: unknown): Fragment {
  switch (op) {
    case 'eq':
      return db`lower(${col}) = lower(${value as string})`;
    case 'neq':
      return db`lower(${col}) IS DISTINCT FROM lower(${value as string})`;
    case 'contains':
      return db`${col} ILIKE ${'%' + likeEscape(value as string) + '%'} ESCAPE '\\'`;
    case 'not_contains':
      return db`(${col} IS NULL OR ${col} NOT ILIKE ${'%' + likeEscape(value as string) + '%'} ESCAPE '\\')`;
    case 'starts_with':
      return db`${col} ILIKE ${likeEscape(value as string) + '%'} ESCAPE '\\'`;
    case 'in':
      return db`lower(${col}) IN (SELECT lower(x) FROM jsonb_array_elements_text(${listJson(db, value as unknown[])}::jsonb) x)`;
    case 'not_in':
      return db`(${col} IS NULL OR lower(${col}) NOT IN (SELECT lower(x) FROM jsonb_array_elements_text(${listJson(db, value as unknown[])}::jsonb) x))`;
    case 'exists':
      return db`(${col} IS NOT NULL AND ${col} <> '')`;
    case 'not_exists':
      return db`(${col} IS NULL OR ${col} = '')`;
  }
  throw new Error(`text operator ${op}`);
}

function orderCompare(db: Db, expr: Fragment, op: FilterOperator, param: Fragment): Fragment {
  switch (op) {
    case 'eq':
      return db`${expr} = ${param}`;
    case 'neq':
      return db`${expr} IS DISTINCT FROM ${param}`;
    case 'gt':
      return db`${expr} > ${param}`;
    case 'gte':
      return db`${expr} >= ${param}`;
    case 'lt':
      return db`${expr} < ${param}`;
    case 'lte':
      return db`${expr} <= ${param}`;
  }
  throw new Error(`order operator ${op}`);
}

function leaf(ctx: CompileContext, c: FilterCondition): Fragment {
  const { db, workspaceId } = ctx;
  const fam = family(c.field);
  const v = c.value;
  switch (fam) {
    case 'email':
    case 'first_name':
    case 'last_name':
    case 'locale':
      return textCompare(db, textColumn(db, fam), c.op, v);

    case 'created_at':
      return orderCompare(db, db`c.created_at`, c.op, db`${v as string}::timestamptz`);

    case 'tag': {
      const has = (slugs: Fragment) => db`EXISTS (SELECT 1 FROM contact_tags ct JOIN tags g ON g.id = ct.tag_id
        WHERE ct.workspace_id = ${workspaceId} AND ct.contact_id = c.id AND g.slug IN ${slugs})`;
      return membership(db, c.op, v, has);
    }

    case 'topic': {
      const has = (slugs: Fragment) => db`EXISTS (SELECT 1 FROM contact_topic_subscriptions s JOIN topics t ON t.id = s.topic_id
        WHERE s.workspace_id = ${workspaceId} AND s.contact_id = c.id AND t.slug IN ${slugs})`;
      return membership(db, c.op, v, has);
    }

    case 'engagement': {
      const kind = c.field === 'engagement:opened' ? 'open' : 'click';
      const any = db`EXISTS (SELECT 1 FROM tracking_events e
        WHERE e.workspace_id = ${workspaceId} AND e.contact_id = c.id AND e.kind = ${kind}
          AND NOT e.is_machine AND (e.kind = 'click' OR NOT e.is_apple_mpp)
          AND e.created_at >= now() - make_interval(days => ${v as number}))`;
      return c.op === 'lte' ? any : db`NOT ${any}`;
    }

    case 'property':
      return property(ctx, c.field.slice('property:'.length), c.op, v);
  }
  throw new Error(`unknown field ${c.field}`);
}

/** `eq` / `in`: a member; `neq` / `not_in`: not a member. The slug list is bound as a JSON parameter. */
function membership(db: Db, op: FilterOperator, value: unknown, has: (slugs: Fragment) => Fragment): Fragment {
  const values = op === 'in' || op === 'not_in' ? (value as unknown[]) : [value];
  const slugs = db`(SELECT x FROM jsonb_array_elements_text(${listJson(db, values)}::jsonb) x)`;
  return op === 'eq' || op === 'in' ? has(slugs) : db`NOT ${has(slugs)}`;
}

function property(ctx: CompileContext, key: string, op: FilterOperator, v: unknown): Fragment {
  const { db } = ctx;
  const raw = db`c.properties -> ${key}::text`;
  const text = db`c.properties ->> ${key}::text`;
  const present = db`(c.properties ? ${key}::text AND jsonb_typeof(${raw}) <> 'null')`;
  if (op === 'exists') return present;
  if (op === 'not_exists') return db`NOT ${present}`;
  const type = ctx.types.get(key);
  const list = op === 'in' || op === 'not_in';

  if (type === 'number' || (type === undefined && ['gt', 'gte', 'lt', 'lte'].includes(op))) {
    const num = db`(CASE WHEN jsonb_typeof(${raw}) = 'number' THEN (${text})::numeric END)`;
    if (list) {
      const inList = db`${num} IN (SELECT x::numeric FROM jsonb_array_elements_text(${listJson(db, v as unknown[])}::jsonb) x)`;
      return op === 'in' ? inList : db`NOT (${num} IS NOT NULL AND ${inList})`;
    }
    return orderCompare(db, num, op, db`${String(v)}::numeric`);
  }

  if (type === 'date') {
    // Compared by calendar day: the first ten characters of an ISO 8601 value.
    const day = db`(CASE WHEN jsonb_typeof(${raw}) = 'string' AND ${text} ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}' THEN left(${text}, 10) END)`;
    if (list) {
      const days = (v as string[]).map((d) => d.slice(0, 10));
      const inList = db`${day} IN (SELECT x FROM jsonb_array_elements_text(${listJson(db, days)}::jsonb) x)`;
      return op === 'in' ? inList : db`NOT (${day} IS NOT NULL AND ${inList})`;
    }
    return orderCompare(db, day, op, db`${(v as string).slice(0, 10)}::text`);
  }

  if (op === 'contains' || op === 'not_contains' || op === 'starts_with') {
    const str = db`(CASE WHEN jsonb_typeof(${raw}) = 'string' THEN ${text} END)`;
    return textCompare(db, str, op, v);
  }

  if (type === 'string') {
    const str = db`(CASE WHEN jsonb_typeof(${raw}) = 'string' THEN ${text} END)`;
    if (list) {
      const inList = db`${str} IN (SELECT x FROM jsonb_array_elements_text(${listJson(db, v as unknown[])}::jsonb) x)`;
      return op === 'in' ? inList : db`NOT (${str} IS NOT NULL AND ${inList})`;
    }
    return op === 'eq' ? db`${str} = ${v as string}` : db`${str} IS DISTINCT FROM ${v as string}`;
  }

  // A boolean, or an undefined key: JSON equality, so 1 never equals "1".
  if (list) {
    const inList = db`EXISTS (SELECT 1 FROM jsonb_array_elements(${listJson(db, v as unknown[])}::jsonb) x WHERE x = ${raw})`;
    return op === 'in' ? inList : db`NOT ${inList}`;
  }
  const param = db`${db.json(v as postgres.JSONValue)}::jsonb`;
  return op === 'eq' ? db`${raw} = ${param}` : db`${raw} IS DISTINCT FROM ${param}`;
}
