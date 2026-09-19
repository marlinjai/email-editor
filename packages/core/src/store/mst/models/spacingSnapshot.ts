// packages/core/src/store/mst/models/spacingSnapshot.ts
/**
 * The document schema (and the server compiler) stores a section's, a
 * column's and a block's padding as one object, `padding: { top, right,
 * bottom, left }`. The store keeps the four sides as flat fields
 * (`paddingTop`, ...), which the inspector edits one at a time. These two
 * functions map between the shapes at the snapshot boundary, so a stored
 * document opens with its padding and every snapshot the store emits carries
 * the schema's `padding` object, which the compiler reads.
 */

const SIDES = [
  ['top', 'paddingTop'],
  ['right', 'paddingRight'],
  ['bottom', 'paddingBottom'],
  ['left', 'paddingLeft'],
] as const;

type Flat = { paddingTop?: string; paddingRight?: string; paddingBottom?: string; paddingLeft?: string };

/** Stored shape in: `padding` becomes the flat fields. A flat field already present wins. */
export function paddingIn<T>(snapshot: T): T {
  if (!snapshot || typeof snapshot !== 'object') return snapshot;
  const { padding, ...rest } = snapshot as T & { padding?: Record<string, unknown> };
  if (padding === undefined) return snapshot;
  const flat = rest as Flat & Record<string, unknown>;
  if (padding && typeof padding === 'object') {
    for (const [side, field] of SIDES) {
      const value = padding[side];
      if (flat[field] === undefined && typeof value === 'string' && value !== '') flat[field] = value;
    }
  }
  return flat as T;
}

/** Store shape out: the flat fields become `padding`, holding only the sides that are set. */
export function paddingOut<T>(snapshot: T): T {
  if (!snapshot || typeof snapshot !== 'object') return snapshot;
  const { paddingTop, paddingRight, paddingBottom, paddingLeft, ...rest } = snapshot as T & Flat;
  const values: Record<string, string | undefined> = {
    top: paddingTop,
    right: paddingRight,
    bottom: paddingBottom,
    left: paddingLeft,
  };
  const padding: Record<string, string> = {};
  for (const [side] of SIDES) {
    const value = values[side];
    if (typeof value === 'string' && value !== '') padding[side] = value;
  }
  return (Object.keys(padding).length > 0 ? { ...rest, padding } : rest) as T;
}
