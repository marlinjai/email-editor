import type { ContactPropertyType, ValidationIssue } from '@marlinjai/mail-contract';

/** An ISO 8601 date, or a date with a time and an offset (or `Z`). */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d{1,9})?)?(Z|[+-]\d{2}:?\d{2})?)?$/;

/** Why `value` is not a valid `type`, or null when it is. `null` is always valid: it removes the value. */
export function propertyTypeError(type: ContactPropertyType, value: unknown): string | null {
  if (value === null) return null;
  switch (type) {
    case 'string':
      return typeof value === 'string' ? null : 'must be a string';
    case 'number':
      return typeof value === 'number' && Number.isFinite(value) ? null : 'must be a number';
    case 'boolean':
      return typeof value === 'boolean' ? null : 'must be true or false';
    case 'date':
      return typeof value === 'string' && ISO_DATE.test(value) && !Number.isNaN(Date.parse(value.slice(0, 10)))
        ? null
        : 'must be an ISO 8601 date, like 2026-09-18';
  }
}

/**
 * Checks every defined key of `properties` against the workspace's types.
 * Keys without a definition are free-form and pass. Returns the issues in the
 * contract's `validation_failed` shape, under `path` (e.g. `['properties']`).
 */
export function checkProperties(
  types: ReadonlyMap<string, ContactPropertyType>,
  properties: Record<string, unknown>,
  path: (string | number)[] = ['properties'],
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  for (const [key, value] of Object.entries(properties)) {
    const type = types.get(key);
    if (!type) continue;
    const error = propertyTypeError(type, value);
    if (error) issues.push({ path: [...path, key], message: `${key} ${error} (defined as ${type})` });
  }
  return issues;
}

/**
 * Turns CSV text into the value a typed property stores: a number, a boolean
 * (`true`/`false`, `yes`/`no`, `1`/`0`, case-insensitive) or a date as written.
 * An empty cell is `undefined` (the column says nothing for this row). Returns
 * `{ error }` when the text cannot be the type.
 */
export function coerceCsvValue(type: ContactPropertyType | undefined, text: string): { value: unknown } | { error: string } | undefined {
  const t = text.trim();
  if (t === '') return undefined;
  switch (type) {
    case undefined:
    case 'string':
      return { value: t };
    case 'number': {
      const n = Number(t.replace(',', '.'));
      return /^[-+]?\d+([.,]\d+)?$/.test(t) && Number.isFinite(n) ? { value: n } : { error: 'is not a number' };
    }
    case 'boolean': {
      const v = t.toLowerCase();
      if (['true', 'yes', '1'].includes(v)) return { value: true };
      if (['false', 'no', '0'].includes(v)) return { value: false };
      return { error: 'is not true or false' };
    }
    case 'date':
      return propertyTypeError('date', t) === null ? { value: t } : { error: 'is not an ISO 8601 date' };
  }
}
