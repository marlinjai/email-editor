// packages/ui/src/sidebar/layersTree.ts
// The Layers panel's document tree as one flat, sortable list, and what a drop in it means

/**
 * One row of the Layers panel's sortable list. Sections inside a wrapper
 * follow the wrapper's row and are closed by an `end` row, so a drop right
 * above the `end` row lands inside the wrapper and a drop right below it
 * lands after it, at the top level.
 */
export type LayerRow =
  | { id: string; kind: 'section'; parent: string | null }
  | { id: string; kind: 'wrapper'; collapsed: boolean }
  | { id: string; kind: 'end'; parent: string };

/** The document's top level, as the panel reads it. */
export type LayerItem = { id: string; type: 'section' } | { id: string; type: 'wrapper'; sections: string[] };

export const endRowId = (wrapperId: string) => `layers-end:${wrapperId}`;

/** The rows, top to bottom. A collapsed wrapper hides its sections (it still takes a drop onto its row). */
export function flattenLayers(items: LayerItem[], collapsed: ReadonlySet<string> = new Set()): LayerRow[] {
  const rows: LayerRow[] = [];
  for (const item of items) {
    if (item.type === 'section') {
      rows.push({ id: item.id, kind: 'section', parent: null });
      continue;
    }
    const isCollapsed = collapsed.has(item.id);
    rows.push({ id: item.id, kind: 'wrapper', collapsed: isCollapsed });
    if (!isCollapsed) for (const s of item.sections) rows.push({ id: s, kind: 'section', parent: item.id });
    rows.push({ id: endRowId(item.id), kind: 'end', parent: item.id });
  }
  return rows;
}

/** What the store should do for a drop. */
export type LayerMove =
  | { kind: 'move-section'; sectionId: string; wrapperId: string | null; index: number }
  | { kind: 'move-top'; itemId: string; index: number };

/**
 * The move a drop means: `activeId` dropped where `overId` was. Sections move
 * into, out of and between wrappers by where they land: the row above the
 * landing place decides (a wrapper row: first in that wrapper; a section in a
 * wrapper: after it, in that wrapper; an `end` row or a top-level section:
 * after it, at the top level). A wrapper only ever moves at the top level.
 * Null when the drop changes nothing.
 */
export function planLayerDrop(items: LayerItem[], rows: LayerRow[], activeId: string, overId: string): LayerMove | null {
  if (activeId === overId) return null;
  const from = rows.findIndex((r) => r.id === activeId);
  const to = rows.findIndex((r) => r.id === overId);
  if (from === -1 || to === -1) return null;
  const active = rows[from]!;
  if (active.kind === 'end') return null;

  const topIds = items.map((i) => i.id);

  if (active.kind === 'wrapper') {
    const over = rows[to]!;
    const overTop = over.kind === 'wrapper' ? over.id : over.kind === 'end' ? over.parent : (over.parent ?? over.id);
    const index = topIds.indexOf(overTop);
    if (index === -1 || overTop === active.id) return null;
    return { kind: 'move-top', itemId: active.id, index };
  }

  // A section: where it lands in the list after the move, and the row above that.
  const order = rows.slice();
  order.splice(from, 1);
  order.splice(to, 0, active);
  const above = order[to - 1];

  const topWithout = topIds.filter((id) => id !== active.id);
  const inWrapperWithout = (wrapperId: string) => {
    const w = items.find((i) => i.id === wrapperId);
    return w && w.type === 'wrapper' ? w.sections.filter((id) => id !== active.id) : [];
  };

  let target: { wrapperId: string | null; index: number };
  if (!above) {
    target = { wrapperId: null, index: 0 };
  } else if (above.kind === 'wrapper') {
    target = { wrapperId: above.id, index: 0 };
  } else if (above.kind === 'end') {
    target = { wrapperId: null, index: topWithout.indexOf(above.parent) + 1 };
  } else if (above.parent) {
    target = { wrapperId: above.parent, index: inWrapperWithout(above.parent).indexOf(above.id) + 1 };
  } else {
    target = { wrapperId: null, index: topWithout.indexOf(above.id) + 1 };
  }

  // Unchanged: the same list, the same place.
  const currentParent = active.parent;
  const currentIndex = currentParent === null ? topIds.indexOf(active.id) : (items.find((i) => i.id === currentParent) as { sections: string[] }).sections.indexOf(active.id);
  if (target.wrapperId === currentParent && target.index === currentIndex) return null;
  return { kind: 'move-section', sectionId: active.id, ...target };
}
