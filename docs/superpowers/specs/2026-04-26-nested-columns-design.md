---
title: Nested Columns (Depth-2) Design
type: plan
status: completed
summary: Allow a column to split into 2-4 sub-columns side by side, compiled to email-safe nested HTML tables for the 85-90% client tier (Apple Mail + Gmail + modern Outlook).
tags: [nesting, mjml, columns, canvas-ux, compatibility]
date: 2026-04-26
---

# Nested Columns (Depth-2) Design

## Problem

Today, a `Section` contains 1-4 `Column`s, and each `Column` contains a flat list of blocks. Users want asymmetric layouts where one column itself splits into 2-4 sub-columns (the literal example: "two-column section where the right column has two sub-columns"). The current flat model cannot express this. The MJML schema also cannot express it natively, since `mj-column` does not allow `mj-section` or another `mj-column` as a child.

We want this to feel as smooth as the Framer-clone canvas while staying email-safe in the 85-90% client tier (Apple Mail + Gmail + modern Outlook). Classic Outlook for Windows (Word render engine) is explicitly out of scope; it retires in October 2026, and the Word renderer's nested-table behaviour breaks past one level of nesting.

See `docs/internal/email-client-rendering-landscape.md` for the tier rationale.

## Goals

- A column can be "split" into 2, 3, or 4 sub-columns from the inspector or the canvas.
- Sub-columns are themselves selectable in the canvas (handle-on-hover, inspector switches to sub-column properties).
- Leaf blocks (text, image, button, divider, spacer, social) can be dragged into sub-columns and rearranged.
- Compiles to MJML that produces correct nested-table HTML in the 85-90% tier.
- Mobile (`<480px`): sub-columns stack to full width inside the (already stacked) parent column.
- Backspace deletes the selected sub-column when no block has focus.
- Layers panel shows sub-columns as nested children with the same affordances as columns.

## Non-goals

- Depth-3 nesting (sub-sub-columns).
- Container blocks (Hero, Carousel, Accordion, Navbar, Header, Footer, Table) inside sub-columns. The block palette will hide them when a sub-column is the active drop target.
- Classic Outlook for Windows fallback (no `mso-` conditional comments for the nested area).
- A configurable per-template "compatibility tier" setting. Tracked separately as a follow-up; v1 always emits 85-90% output.
- Drag-and-drop of sub-columns between different parent columns. Sub-columns can only reorder within their own parent.
- Resizing sub-columns by dragging a divider on the canvas. Width is changed via the inspector slider.

## Architecture

### Data model

A new `SubColumnModel` lives next to `ColumnModel` in `packages/core/src/store/mst/models/`. It is a structurally similar but separate type, so the schema enforces "no further nesting" without runtime checks.

```ts
// SubColumnModel.ts
export const SubColumnModel = types
  .model('SubColumn', {
    id: types.identifier,
    width: types.optional(types.number, 50),
    backgroundColor: types.maybe(types.string),
    backgroundGradient: types.maybe(types.frozen<BackgroundGradient>()),
    verticalAlign: types.maybe(types.enumeration(['top', 'middle', 'bottom'])),
    paddingTop: types.maybe(types.string),
    paddingRight: types.maybe(types.string),
    paddingBottom: types.maybe(types.string),
    paddingLeft: types.maybe(types.string),
    blocks: types.array(BlockModel),
  })
  .actions(/* same shape as ColumnModel: addBlock, removeBlock, moveBlock, etc. */)
  .views(/* isEmpty, computedStyle, mjmlAttributes */);
```

`ColumnModel` gains an optional `subColumns` array:

```ts
// ColumnModel.ts (additions)
subColumns: types.optional(types.array(SubColumnModel), []),
```

**Invariant**: `blocks.length === 0 || subColumns.length === 0`. Both can be empty (a freshly-created column), but they are never both populated. The MST `preProcessSnapshot` enforces this at load time, and column-level actions (`split`, `merge`, `addBlock`) maintain it at runtime.

A view `kind: 'leaf' | 'group'` is added to `ColumnModel` for downstream code to branch cleanly.

### Column actions

Two new actions on `ColumnModel`:

```ts
splitIntoSubColumns(count: 2 | 3 | 4) {
  // 1. Migrate self.blocks to a new sub-column[0] (preserves user content).
  // 2. Push (count - 1) more empty sub-columns.
  // 3. Distribute widths evenly (e.g. count=2 -> [50, 50]).
  // 4. self.blocks.clear()
}

mergeSubColumns() {
  // 1. Concatenate all sub-column blocks into self.blocks (preserves order).
  // 2. self.subColumns.clear()
}
```

These keep the user's blocks alive across conversion. The merge surfaces a soft warning in the inspector ("This will combine N sub-columns into one column.") only when sub-columns have non-trivial styling that the merge cannot preserve (different backgrounds, paddings, vertical aligns).

### MJML compiler output

The compiler walks the tree as today. When it visits a `Column` with `subColumns.length > 0`, it emits a single `<mj-raw>` containing a hand-built table inside the parent `<mj-column>`. Leaf blocks inside sub-columns are rendered to inline HTML by per-block functions that mirror the existing MJML emitters but produce raw HTML strings instead of MJML tags.

Generated structure for a 2-column section where the right column has two sub-columns:

```html
<mj-section>
  <mj-column width="50%">
    <mj-image src="hero.jpg" />
  </mj-column>

  <mj-column width="50%">
    <mj-raw>
      <table role="presentation" class="ee-sub-cols" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
        <tr>
          <td class="ee-sub-col" width="50%" valign="top" style="padding:10px;">
            <!-- inline HTML for sub-column 1 blocks -->
          </td>
          <td class="ee-sub-col" width="50%" valign="top" style="padding:10px;">
            <!-- inline HTML for sub-column 2 blocks -->
          </td>
        </tr>
      </table>
    </mj-raw>
  </mj-column>
</mj-section>
```

A single `<mj-style>` block at document root provides the responsive media query (only emitted once per template, only when sub-columns exist anywhere):

```css
@media only screen and (max-width:480px) {
  table.ee-sub-cols td.ee-sub-col {
    display: block !important;
    width: 100% !important;
    padding-bottom: 12px !important;
  }
  table.ee-sub-cols td.ee-sub-col:last-child {
    padding-bottom: 0 !important;
  }
}
```

### Per-block raw-HTML emitters

A new file `packages/core/src/compiler/blockToRawHtml.ts` exports `blockToRawHtml(block: Block): string` covering the 6 leaf blocks. Each emitter is a thin function that produces an inline-styled HTML fragment (table-based where needed for Outlook web). These mirror the existing MJML compiler's intent without recreating MJML's responsive logic, since the nested area is fixed-width inside the parent column anyway.

The container-block compilers stay unchanged and are simply unreachable for sub-columns (the canvas prevents them being added).

### Canvas rendering

`packages/ui/src/renderer/SubColumnRenderer.tsx` (new): renders one sub-column as a `<td>` inside a `<table>` that the parent `ColumnRenderer` owns. Mirrors `ColumnRenderer`'s selection/hover affordances:

- Sub-column handle: small pill at top-center of the `<td>`, lighter blue (`bg-blue-50` text-blue-700` on idle, `bg-blue-500 text-white` when selected). Z-index 5 (below column handle's z-10).
- Inset selection ring (1px) when selected; lighter (0.5px-equivalent via opacity) when hovered.
- Empty placeholder ("Drop blocks here") same as columns.

`ColumnRenderer.tsx` branches at the top:
- If `column.kind === 'leaf'`: existing rendering path.
- If `column.kind === 'group'`: render a `<table>` with one `<td>` per sub-column, each containing a `<SubColumnRenderer>`.

### Selection scoping

`EditorUIStore` gains `selectedSubColumnId: string | undefined` and `hoverSubColumnId: string | undefined`, plus `selectSubColumn(id)`. Selection is mutually exclusive with the existing `selectedBlockId`, `selectedColumnId`, `selectedSectionId` (the existing pattern: setting one clears the others).

When a sub-column is selected, the inspector shows sub-column properties (width slider 0-100%, background, vertical align, padding). The block palette in the elements panel hides container blocks while a sub-column is the active drop target.

### Layers panel

The `LayersPanel` recursively renders sub-columns under their parent column with one extra indent level. A sub-column row shows: drag handle, label ("Sub-column 1 (50%)"), visibility toggle. Same delete/duplicate affordances as a column.

### Drag and drop

Block drops into sub-columns reuse the existing dnd-kit drop-zone infrastructure. A new drop-zone id format: `drop-subcolumn-<subColumnId>`. The drop handler in `EmailEditor.tsx`'s `handleDrop` detects this prefix and inserts into the sub-column's blocks array.

Sub-columns themselves are NOT draggable across parent columns in v1 (out of scope above). Sub-column reordering inside the same parent column is handled by drag-and-drop on the sub-column handle, with drop indicators appearing between sub-columns.

### Inspector

When a sub-column is selected, the inspector shows:
- Width slider (a sub-column's width is a percentage of the parent column, sums must equal 100% — UI auto-rebalances neighbours when one is changed).
- Background color, vertical align, padding (same controls as Column).
- A "Move to single column" button that calls `parentColumn.mergeSubColumns()` and selects the parent column afterwards.

When a Column is selected, the inspector gains a "Split into sub-columns" control with options [2, 3, 4] (only visible when the column is currently leaf-kind).

### Keyboard shortcuts

Existing `useKeyboardShortcuts` hook in `EmailEditor.tsx` is extended to handle Backspace / Delete for sub-columns: if `selectedSubColumnId` is set and the active element is not an input, delete the sub-column (and select the parent column afterwards). If deleting would leave the parent with one sub-column, automatically merge the remaining sub-column back into the parent column (so we don't end up with a "1 sub-column" structure that is identical to a normal column).

## Data flow

1. User selects a column in the canvas, clicks "Split into sub-columns" → 2 in the inspector.
2. `column.splitIntoSubColumns(2)` runs: existing blocks (if any) move into sub-column 1; sub-column 2 is empty.
3. Canvas re-renders the column as a `<table>` of two `<td>`s.
4. User drags a Text block from the palette into sub-column 2's drop zone.
5. `handleDrop` in `EmailEditor.tsx` parses `drop-subcolumn-<id>` and inserts via `subColumn.addBlock(...)`.
6. On save, the compiler walks the template; for the column with sub-columns, it emits the `<mj-raw>` table; the `<mj-style>` media query is added once.
7. `mjml2html` runs; output HTML renders side-by-side in Apple Mail / Gmail / modern Outlook, stacks on `<480px`.

## Error handling and invariants

- **Invariant: blocks XOR sub-columns**. Enforced in MST `preProcessSnapshot` and in every action that touches `blocks` or `subColumns`.
- **Invariant: 1 <= subColumns.length <= 4**. Enforced in `splitIntoSubColumns` and the inspector's count selector. Removing a sub-column when count would drop to 1 triggers automatic merge.
- **Width sum**: sub-column widths should sum to 100. The inspector auto-rebalances on edit. The compiler clamps + re-normalizes if the sum is off (defensive against bad imports).
- **Container blocks in sub-columns**: rejected at the drag-source level (palette hides them when sub-column is the active drop target) AND at the action level (`subColumn.addBlock` throws if given a container-type block; the `BlockType` enum has a `LEAF_BLOCK_TYPES` const used by both).
- **Import / hydration of legacy templates**: existing templates have no `subColumns`; MST's `types.optional` defaults to `[]`. No migration required.
- **Empty sub-columns at save**: allowed. The compiler emits an empty `<td>` with the same padding so the layout doesn't shift.

## Testing strategy

### Unit tests

- `packages/core/src/store/__tests__/SubColumnModel.test.ts`: model creation, addBlock, removeBlock, moveBlock, computed properties.
- `packages/core/src/store/__tests__/ColumnModel.subcolumns.test.ts`:
  - `splitIntoSubColumns(2|3|4)` migrates blocks correctly.
  - `mergeSubColumns()` concatenates blocks in order.
  - Invariant: `blocks` and `subColumns` cannot both be non-empty.
  - Container-block rejection.
- `packages/core/src/compiler/__tests__/MJMLCompiler.subcolumns.test.ts`:
  - Snapshot test of MJML output for a column with 2 sub-columns.
  - Snapshot test of HTML output (post-`mjml2html`).
  - Media query is emitted exactly once even with multiple sub-column groups.
  - Per-block raw HTML emitters produce expected fragments for each leaf block type.

### Integration tests

- `packages/ui/src/__tests__/SubColumnRenderer.test.tsx` (if any UI tests exist; otherwise skip and rely on manual verification).

### Manual verification (in dev server)

- Split a column into 2 sub-columns; drag a text block into each; verify both render side-by-side at 600px and stack at 375px (mobile preview).
- Open the exported HTML in a browser at 600px and 375px widths to verify the media query.
- Send the exported HTML through Litmus or Email on Acid (manual, post-merge) and verify Apple Mail, Gmail, Outlook 365 web / Outlook for Mac. Track Classic Outlook as expected-broken (out of scope).

## Open questions

None blocking. The compatibility tier system, drag-between-parents, and resize-by-divider are deliberate non-goals tracked for follow-up slices.

## Implementation slices

The implementation plan (separate document) breaks this into:
1. Data model: `SubColumnModel` + `ColumnModel` extensions + `splitIntoSubColumns` / `mergeSubColumns` actions.
2. Compiler: per-block raw-HTML emitters + `<mj-raw>` nested-table emission + media-query injection.
3. Canvas: `SubColumnRenderer` + `ColumnRenderer` branching + selection chrome.
4. Selection store: `selectedSubColumnId`, `hoverSubColumnId`, mutual exclusion.
5. Inspector: split control, sub-column property panel, width auto-rebalance.
6. Drag-and-drop: drop-zone wiring for sub-columns + container-block palette filter.
7. Layers panel: nested rendering.
8. Keyboard shortcuts: Backspace for sub-columns, auto-merge on drop-to-1.

Each slice is independently mergeable.
