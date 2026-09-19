// packages/core/src/store/mst/models/filledDefaults.ts
/**
 * The store's models give most fields a default (`hidden: false`, a column
 * `width` of 100, a template title), and the block model carries the fields of
 * every block type at once (`links`, `items`, `rows`, ...). Without care, a
 * document opened in the editor comes back with all of them, and some change
 * the compiled mail: a title nobody set appears as `<mj-title>`, and two
 * columns without a width both become 100% wide.
 *
 * So the snapshot boundary is symmetric: on the way in, every default the
 * store fills is recorded in the node's `filled` field (the value it filled);
 * on the way out, a recorded field that still holds that value is dropped
 * again, and `filled` itself never leaves the store. A value someone changed
 * in the editor is kept. A document therefore comes back exactly as it went
 * in, apart from the edits (and the template id, which the store assigns).
 */

export type Filled = Record<string, unknown>;
type Snapshot = Record<string, unknown> & { filled?: Filled };

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Stored shape in: fill each absent field with its default, and remember what was filled. */
export function fillDefaults<T>(snapshot: T, defaults: Record<string, () => unknown>): T {
  if (!snapshot || typeof snapshot !== 'object') return snapshot;
  const s = { ...(snapshot as Snapshot) };
  const filled: Filled = { ...(s.filled ?? {}) };
  for (const [key, make] of Object.entries(defaults)) {
    if (s[key] !== undefined) continue;
    const value = make();
    s[key] = value;
    filled[key] = value;
  }
  if (Object.keys(filled).length > 0) s.filled = filled;
  return s as T;
}

/** Store shape out: drop every filled field that still holds what was filled, and the record itself. */
export function dropFilled<T>(snapshot: T): T {
  if (!snapshot || typeof snapshot !== 'object') return snapshot;
  const { filled, ...rest } = snapshot as Snapshot;
  if (filled) {
    for (const [key, value] of Object.entries(filled)) {
      if (same(rest[key], value)) delete rest[key];
    }
  }
  for (const key of Object.keys(rest)) if (rest[key] === undefined) delete rest[key];
  return rest as T;
}

const empty = () => [];
const no = () => false;

/** Every default the block model has, for fields a stored block may leave out. */
export const BLOCK_DEFAULTS: Record<string, () => unknown> = {
  hidden: no,
  content: () => '',
  links: empty,
  items: empty,
  navLinks: empty,
  hamburger: no,
  images: empty,
  headers: empty,
  rows: empty,
  locked: no,
};

export const COLUMN_DEFAULTS: Record<string, () => unknown> = {
  width: () => 100,
  hidden: no,
  subColumns: empty,
};

export const SECTION_DEFAULTS: Record<string, () => unknown> = {
  type: () => 'section',
  fullWidth: no,
  isWrapper: no,
  noStack: no,
  hidden: no,
};

/**
 * A section's columns without a width share it evenly, as MJML shares them;
 * the model would otherwise open each at 100%. Recorded as filled, so an
 * unedited column goes back out without a width.
 */
export function fillColumnWidths<T>(section: T): T {
  if (!section || typeof section !== 'object') return section;
  const s = section as Snapshot & { columns?: unknown[] };
  if (!Array.isArray(s.columns) || s.columns.length === 0) return section;
  if (s.columns.every((c) => (c as Snapshot | null)?.width !== undefined)) return section;
  const share = 100 / s.columns.length;
  return {
    ...s,
    columns: s.columns.map((c) => {
      const col = c as Snapshot | null;
      if (!col || typeof col !== 'object' || col.width !== undefined) return c;
      return { ...col, width: share, filled: { ...(col.filled ?? {}), width: share } };
    }),
  } as T;
}
