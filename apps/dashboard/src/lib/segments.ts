import {
  FILTER_FIELD_OPERATORS,
  MAX_FILTER_DEPTH,
  type ContactPropertyDefinition,
  type ContactPropertyType,
  type FilterOperator,
  type JsonValue,
  type SegmentFilter,
} from '@marlinjai/mail-contract';

/*
 * The segment builder's model: the contract's filter tree (and, or, not over
 * conditions) as groups a form can edit. `not` becomes a flag on the node it
 * wraps, so every filter the service accepts, including ones written through
 * the API, round-trips through the editor unchanged in meaning.
 */

/**
 * `value` is what the form shows. A condition read from a saved filter keeps
 * the value it was saved with (`original`, and the text it was shown as): left
 * untouched, that exact value goes back, whatever its type; edited, the new
 * text is typed like it (a property without a definition that held a number
 * stays a number).
 */
export type ConditionNode = {
  kind: 'condition';
  id: string;
  negate: boolean;
  field: string;
  op: FilterOperator;
  value: string;
  original?: { value: JsonValue; text: string };
};
export type GroupNode = { kind: 'group'; id: string; negate: boolean; mode: 'and' | 'or'; children: FilterNode[] };
export type FilterNode = ConditionNode | GroupNode;

let seq = 0;
export const nodeId = () => `n${++seq}`;

export const FIELD_LABELS: Record<string, string> = {
  email: 'Email',
  first_name: 'First name',
  last_name: 'Last name',
  locale: 'Language',
  created_at: 'Added',
  tag: 'Tag',
  topic: 'Topic',
  'engagement:opened': 'Opened a mail',
  'engagement:clicked': 'Clicked in a mail',
};

export const OPERATOR_LABELS: Record<FilterOperator, string> = {
  eq: 'is',
  neq: 'is not',
  contains: 'contains',
  not_contains: 'does not contain',
  starts_with: 'starts with',
  gt: 'is after or more than',
  gte: 'is on or after, or at least',
  lt: 'is before or less than',
  lte: 'is on or before, or at most',
  exists: 'is set',
  not_exists: 'is not set',
  in: 'is one of',
  not_in: 'is none of',
};

/** Clearer operator words for the fields where the generic ones read oddly. */
export function operatorLabel(field: string, op: FilterOperator, type: ContactPropertyType | null): string {
  if (field === 'tag') return op === 'eq' ? 'has' : op === 'neq' ? 'does not have' : op === 'in' ? 'has one of' : op === 'not_in' ? 'has none of' : OPERATOR_LABELS[op];
  if (field === 'topic') return op === 'eq' ? 'is subscribed to' : op === 'neq' ? 'is not subscribed to' : op === 'in' ? 'is subscribed to one of' : op === 'not_in' ? 'is subscribed to none of' : OPERATOR_LABELS[op];
  if (field.startsWith('engagement:')) return op === 'lte' ? 'within the last (days)' : op === 'gt' ? 'not within the last (days)' : OPERATOR_LABELS[op];
  const dated = field === 'created_at' || type === 'date';
  const numeric = type === 'number';
  if (dated) return { gt: 'is after', gte: 'is on or after', lt: 'is before', lte: 'is on or before' }[op as 'gt'] ?? OPERATOR_LABELS[op];
  if (numeric) return { gt: 'is more than', gte: 'is at least', lt: 'is less than', lte: 'is at most' }[op as 'gt'] ?? OPERATOR_LABELS[op];
  return OPERATOR_LABELS[op];
}

/** The operators a field takes, from the contract's table. */
export function operatorsFor(field: string): readonly FilterOperator[] {
  if (field.startsWith('property:')) return FILTER_FIELD_OPERATORS.property!;
  if (field.startsWith('engagement:')) return FILTER_FIELD_OPERATORS.engagement!;
  return FILTER_FIELD_OPERATORS[field] ?? [];
}

export const takesValue = (op: FilterOperator) => op !== 'exists' && op !== 'not_exists';
export const takesList = (op: FilterOperator) => op === 'in' || op === 'not_in';

export function propertyType(field: string, properties: ContactPropertyDefinition[]): ContactPropertyType | null {
  if (!field.startsWith('property:')) return null;
  const key = field.slice('property:'.length);
  return properties.find((p) => p.key === key)?.type ?? null;
}

/** One value as text: an object or array as JSON, null as nothing. */
function scalarText(value: JsonValue): string {
  if (value === null) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/** In a list, a comma or a backslash inside one value is escaped with a backslash. */
const escapeItem = (text: string) => text.replace(/\\/g, '\\\\').replace(/,/g, '\\,');

/** The value as the form holds it: text, with list items separated by commas. */
export function valueToText(value: JsonValue | undefined): string {
  if (value === undefined) return '';
  if (Array.isArray(value)) return value.map((v) => escapeItem(scalarText(v))).join(', ');
  return scalarText(value);
}

/** A list typed as text back into its items: commas separate, a backslash escapes the next character. */
export function splitList(text: string): string[] {
  const items: string[] = [];
  let current = '';
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (c === '\\' && i + 1 < text.length) {
      current += text[++i];
    } else if (c === ',') {
      items.push(current);
      current = '';
    } else {
      current += c;
    }
  }
  items.push(current);
  return items.map((x) => x.trim()).filter((x) => x !== '');
}

export function fromFilter(filter: SegmentFilter, negate = false): FilterNode {
  if ('and' in filter) return { kind: 'group', id: nodeId(), negate, mode: 'and', children: filter.and.map((f) => fromFilter(f)) };
  if ('or' in filter) return { kind: 'group', id: nodeId(), negate, mode: 'or', children: filter.or.map((f) => fromFilter(f)) };
  if ('not' in filter) return fromFilter(filter.not, !negate);
  const text = valueToText(filter.value);
  return {
    kind: 'condition',
    id: nodeId(),
    negate,
    field: filter.field,
    op: filter.op,
    value: text,
    ...(filter.value !== undefined ? { original: { value: filter.value, text } } : {}),
  };
}

/** Every editor starts from a group, so there is always somewhere to add a condition. */
export function rootFrom(filter: SegmentFilter | null): GroupNode {
  if (!filter) return emptyRoot();
  const node = fromFilter(filter);
  return node.kind === 'group' ? node : { kind: 'group', id: nodeId(), negate: false, mode: 'and', children: [node] };
}

export function emptyRoot(): GroupNode {
  return { kind: 'group', id: nodeId(), negate: false, mode: 'and', children: [newCondition()] };
}

export function newCondition(field = 'email'): ConditionNode {
  return { kind: 'condition', id: nodeId(), negate: false, field, op: operatorsFor(field)[0]!, value: '' };
}

export function newGroup(): GroupNode {
  return { kind: 'group', id: nodeId(), negate: false, mode: 'or', children: [newCondition()] };
}

export type BuildResult = { ok: true; filter: SegmentFilter } | { ok: false; problems: Record<string, string> };

/**
 * One scalar of a condition, typed the way the service compares the field. A
 * property without a definition is typed like the value it had (`like`), so an
 * edit keeps a number a number, a yes or no a boolean, and an object an object.
 */
function scalar(field: string, text: string, type: ContactPropertyType | null, like?: JsonValue): { ok: true; value: JsonValue } | { ok: false; problem: string } {
  const t = text.trim();
  if (t === '') return { ok: false, problem: 'Enter a value' };
  if (field.startsWith('property:') && type === null && like !== undefined && like !== null) {
    if (typeof like === 'number' && t !== '' && Number.isFinite(Number(t))) return { ok: true, value: Number(t) };
    if (typeof like === 'boolean' && (t === 'true' || t === 'false')) return { ok: true, value: t === 'true' };
    if (typeof like === 'object') {
      try {
        const parsed = JSON.parse(t) as JsonValue;
        if (parsed !== null && typeof parsed === 'object') return { ok: true, value: parsed };
      } catch {
        // not JSON any more: compared as text
      }
    }
  }
  if (field.startsWith('engagement:')) {
    const n = Number(t);
    return Number.isInteger(n) && n > 0 ? { ok: true, value: n } : { ok: false, problem: 'A whole number of days' };
  }
  if (field === 'created_at' || type === 'date') {
    return /^\d{4}-\d{2}-\d{2}/.test(t) && !Number.isNaN(Date.parse(t)) ? { ok: true, value: t } : { ok: false, problem: 'A date such as 2026-09-18' };
  }
  if (type === 'number') {
    const n = Number(t);
    return t !== '' && Number.isFinite(n) ? { ok: true, value: n } : { ok: false, problem: 'A number' };
  }
  if (type === 'boolean') {
    return t === 'true' || t === 'false' ? { ok: true, value: t === 'true' } : { ok: false, problem: 'Yes or no' };
  }
  return { ok: true, value: t };
}

/**
 * The form's tree back to the contract's filter, or the problems keyed by node
 * id. The service checks the same rules; checking here first lets the preview
 * wait until the filter is complete instead of showing an error per keystroke.
 */
export function toFilter(root: GroupNode, properties: ContactPropertyDefinition[]): BuildResult {
  const problems: Record<string, string> = {};
  const build = (node: FilterNode, depth: number): SegmentFilter | null => {
    let out: SegmentFilter | null;
    if (node.kind === 'group') {
      if (node.children.length === 0) {
        problems[node.id] = 'Add a condition or remove this group';
        return null;
      }
      const children = node.children.map((c) => build(c, depth + 1));
      if (children.some((c) => c === null)) return null;
      // A group of one is just that one condition: the service gets the smallest equivalent tree.
      out = children.length === 1 ? children[0]! : node.mode === 'and' ? { and: children as SegmentFilter[] } : { or: children as SegmentFilter[] };
    } else {
      if (!operatorsFor(node.field).includes(node.op)) {
        problems[node.id] = 'Choose how to compare';
        return null;
      }
      if (node.field.startsWith('property:') && !/^property:[A-Za-z0-9_.-]{1,64}$/.test(node.field)) {
        problems[node.id] = 'A property key: letters, digits, dot, underscore and hyphen';
        return null;
      }
      const type = propertyType(node.field, properties);
      const original = node.original?.value;
      const untouched = node.original !== undefined && node.value === node.original.text && takesList(node.op) === Array.isArray(original);
      const like = (i: number): JsonValue | undefined => (Array.isArray(original) ? (original[i] ?? original[0]) : original);
      if (!takesValue(node.op)) out = { field: node.field, op: node.op };
      else if (untouched) out = { field: node.field, op: node.op, value: original! };
      else if (takesList(node.op)) {
        const parts = splitList(node.value);
        if (parts.length === 0) {
          problems[node.id] = 'Enter one or more values, separated by commas';
          return null;
        }
        const values: JsonValue[] = [];
        for (const [i, p] of parts.entries()) {
          const v = scalar(node.field, p, type, like(i));
          if (!v.ok) {
            problems[node.id] = v.problem;
            return null;
          }
          values.push(v.value);
        }
        out = { field: node.field, op: node.op, value: values };
      } else {
        const v = scalar(node.field, node.value, type, like(0));
        if (!v.ok) {
          problems[node.id] = v.problem;
          return null;
        }
        out = { field: node.field, op: node.op, value: v.value };
      }
    }
    return node.negate ? { not: out } : out;
  };
  const filter = build(root, 1);
  if (!filter || Object.keys(problems).length > 0) return { ok: false, problems };
  if (depthOf(filter) > MAX_FILTER_DEPTH) return { ok: false, problems: { [root.id]: `Groups nest at most ${MAX_FILTER_DEPTH} levels deep` } };
  return { ok: true, filter };
}

function depthOf(f: SegmentFilter): number {
  if ('and' in f) return 1 + Math.max(...f.and.map(depthOf));
  if ('or' in f) return 1 + Math.max(...f.or.map(depthOf));
  if ('not' in f) return 1 + depthOf(f.not);
  return 1;
}

/** How deep a group sits, for offering "add a group" only while the service would still accept it. */
export function canNest(depth: number): boolean {
  // A nested group adds a level, and a negated one a second (the `not`).
  return depth + 2 <= MAX_FILTER_DEPTH;
}

/** Replaces one node anywhere in the tree (by id), immutably. */
export function updateNode(root: GroupNode, id: string, fn: (n: FilterNode) => FilterNode | null): GroupNode {
  const walk = (node: FilterNode): FilterNode | null => {
    if (node.id === id) return fn(node);
    if (node.kind === 'group') {
      const children = node.children.map(walk).filter((c): c is FilterNode => c !== null);
      return { ...node, children };
    }
    return node;
  };
  return walk(root) as GroupNode;
}
