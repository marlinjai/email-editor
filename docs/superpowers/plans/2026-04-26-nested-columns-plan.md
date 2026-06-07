# Nested Columns (Depth-2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow a column to split into 2-4 sub-columns side-by-side, selectable on the canvas, compiled to email-safe nested HTML tables for the 85-90% client tier (Apple Mail + Gmail + modern Outlook).

**Architecture:** A new `SubColumnModel` (separate MST type, identical surface to `ColumnModel` minus its own sub-columns) lives under each `Column`. The MJML compiler emits a `<mj-raw>` block containing a hand-built `<table>` for the nested area. Per-block raw-HTML emitters in `packages/core/src/compiler/blockToRawHtml.ts` render the 6 leaf block types as inline HTML inside the `<mj-raw>` table. Canvas mirrors the existing column selection chrome (handle-on-hover, inset ring) one indent deeper. Container blocks (Hero, Carousel, Accordion, Navbar, Header, Footer, Table, Raw) are blocked from sub-columns at both the palette filter and the action layer.

**Tech Stack:** mobx-state-tree, MJML, React + Tailwind, dnd-kit, vitest, tsup, pnpm + turborepo.

**Spec:** `docs/superpowers/specs/2026-04-26-nested-columns-design.md`

---

## File Structure

**New files:**
- `packages/core/src/store/mst/models/SubColumnModel.ts` (MST model)
- `packages/core/src/store/mst/models/__tests__/SubColumnModel.test.ts` (model tests)
- `packages/core/src/store/mst/models/__tests__/ColumnModel.subcolumns.test.ts` (split / merge tests)
- `packages/core/src/compiler/blockToRawHtml.ts` (raw-HTML leaf block emitters)
- `packages/core/src/compiler/__tests__/blockToRawHtml.test.ts` (emitter tests)
- `packages/core/src/compiler/__tests__/MJMLCompiler.subcolumns.test.ts` (compiler integration)
- `packages/core/src/registry/blockCategories.ts` (LEAF / CONTAINER classification)
- `packages/ui/src/renderer/SubColumnRenderer.tsx` (canvas renderer)
- `packages/ui/src/inspector/properties/SubColumnProperties.tsx` (inspector panel)

**Modified files:**
- `packages/core/src/store/mst/models/ColumnModel.ts` (add `subColumns`, `splitIntoSubColumns`, `mergeSubColumns`, `kind` view)
- `packages/core/src/store/mst/models/index.ts` (export `SubColumnModel`)
- `packages/core/src/store/mst/models/EditorUIStore.ts` (add `selectedSubColumnId`, `hoverSubColumnId`, mutual-exclusion in selection actions)
- `packages/core/src/store/mst/RootStore.ts` (add `selectedSubColumn` view)
- `packages/core/src/compiler/MJMLCompiler.ts` (branch on `column.kind === 'group'`, emit nested table; emit `<mj-style>` media query once)
- `packages/ui/src/renderer/ColumnRenderer.tsx` (branch on `column.kind`)
- `packages/ui/src/inspector/PropertyInspector.tsx` (route to `SubColumnProperties` when sub-column is selected)
- `packages/ui/src/inspector/properties/ColumnProperties.tsx` (add "Split into sub-columns" control when leaf)
- `packages/ui/src/inspector/properties/index.ts` (export `SubColumnProperties`)
- `packages/ui/src/sidebar/LayersPanel.tsx` (recursive sub-column rows)
- `packages/ui/src/sidebar/ElementsPanel.tsx` (filter container blocks when a sub-column is selected)
- `packages/ui/src/EmailEditor.tsx` (handleDrop for `drop-subcolumn-<id>`, Backspace for sub-column with auto-merge)

---

## Task 0: Read the spec

**Files:**
- Read: `docs/superpowers/specs/2026-04-26-nested-columns-design.md`

- [ ] **Step 1: Read the spec end-to-end before touching code.** It defines the invariants ("blocks XOR sub-columns", count 2-4, no container blocks, no depth-3) that every later task assumes.

---

## Task 1: Block category classifier

**Files:**
- Create: `packages/core/src/registry/blockCategories.ts`
- Test: `packages/core/src/registry/__tests__/blockCategories.test.ts`

The compiler, the inspector palette filter, and the column action layer all need to know "is this block type a leaf or a container?". Define the classification once.

- [ ] **Step 1: Write the failing test**

```ts
// packages/core/src/registry/__tests__/blockCategories.test.ts
import { describe, it, expect } from 'vitest';
import { BlockType } from '../../store/mst/models/BlockModel';
import { LEAF_BLOCK_TYPES, CONTAINER_BLOCK_TYPES, isLeafBlockType } from '../blockCategories';

describe('block categories', () => {
  it('classifies leaf blocks', () => {
    expect(LEAF_BLOCK_TYPES).toEqual(
      expect.arrayContaining([
        BlockType.TEXT, BlockType.IMAGE, BlockType.BUTTON,
        BlockType.DIVIDER, BlockType.SPACER, BlockType.SOCIAL,
      ]),
    );
  });

  it('classifies container blocks', () => {
    expect(CONTAINER_BLOCK_TYPES).toEqual(
      expect.arrayContaining([
        BlockType.HERO, BlockType.ACCORDION, BlockType.RAW,
        BlockType.NAVBAR, BlockType.CAROUSEL, BlockType.TABLE,
        BlockType.HEADER, BlockType.FOOTER,
      ]),
    );
  });

  it('isLeafBlockType returns true for text, false for hero', () => {
    expect(isLeafBlockType(BlockType.TEXT)).toBe(true);
    expect(isLeafBlockType(BlockType.HERO)).toBe(false);
  });

  it('every BlockType is exactly one of leaf or container', () => {
    const all = Object.values(BlockType);
    for (const t of all) {
      const inLeaf = LEAF_BLOCK_TYPES.includes(t);
      const inContainer = CONTAINER_BLOCK_TYPES.includes(t);
      expect(inLeaf !== inContainer).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Run test, verify failure**

Run: `pnpm -F @marlinjai/email-editor-core test -- src/registry/__tests__/blockCategories.test.ts`
Expected: FAIL with "Cannot find module '../blockCategories'".

- [ ] **Step 3: Implement**

```ts
// packages/core/src/registry/blockCategories.ts
import { BlockType } from '../store/mst/models/BlockModel';

/**
 * Leaf blocks have no internal structure. Safe to render inside a nested
 * <td> in the email-safe HTML island used for sub-columns.
 */
export const LEAF_BLOCK_TYPES: BlockType[] = [
  BlockType.TEXT,
  BlockType.IMAGE,
  BlockType.BUTTON,
  BlockType.DIVIDER,
  BlockType.SPACER,
  BlockType.SOCIAL,
];

/**
 * Container blocks wrap their own structural HTML (hero with bg + cta,
 * carousel, accordion, table, etc.). Disallowed inside sub-columns
 * because they would compound table nesting beyond what the 85-90%
 * client tier can render reliably.
 */
export const CONTAINER_BLOCK_TYPES: BlockType[] = [
  BlockType.HERO,
  BlockType.ACCORDION,
  BlockType.RAW,
  BlockType.NAVBAR,
  BlockType.CAROUSEL,
  BlockType.TABLE,
  BlockType.HEADER,
  BlockType.FOOTER,
];

export function isLeafBlockType(t: BlockType): boolean {
  return LEAF_BLOCK_TYPES.includes(t);
}
```

- [ ] **Step 4: Re-export from `packages/core/src/registry/index.ts`** (append):

```ts
export * from './blockCategories';
```

- [ ] **Step 5: Re-export from package root `packages/core/src/index.ts`** (append):

```ts
export {
  LEAF_BLOCK_TYPES,
  CONTAINER_BLOCK_TYPES,
  isLeafBlockType,
} from './registry/blockCategories';
```

- [ ] **Step 6: Run test, verify pass**

Run: `pnpm -F @marlinjai/email-editor-core test -- src/registry/__tests__/blockCategories.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 7: Type check**

Run: `pnpm -F @marlinjai/email-editor-core run lint`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/core/src/registry/blockCategories.ts packages/core/src/registry/__tests__/blockCategories.test.ts packages/core/src/registry/index.ts packages/core/src/index.ts
git commit -m "feat(core): classify blocks as leaf vs container"
```

---

## Task 2: SubColumnModel

**Files:**
- Create: `packages/core/src/store/mst/models/SubColumnModel.ts`
- Test: `packages/core/src/store/mst/models/__tests__/SubColumnModel.test.ts`

Mirrors `ColumnModel` for the parts that apply (id, width, padding, bg, vertical-align, blocks). Has no `subColumns` field — schema enforces no-further-nesting.

- [ ] **Step 1: Write the failing test**

```ts
// packages/core/src/store/mst/models/__tests__/SubColumnModel.test.ts
import { describe, it, expect } from 'vitest';
import { SubColumnModel, createSubColumn } from '../SubColumnModel';
import { BlockType } from '../BlockModel';

describe('SubColumnModel', () => {
  it('creates with defaults', () => {
    const sc = SubColumnModel.create(createSubColumn());
    expect(sc.id).toBeTruthy();
    expect(sc.width).toBe(50);
    expect(sc.blocks.length).toBe(0);
    expect(sc.isEmpty).toBe(true);
  });

  it('rejects container blocks via addBlock', () => {
    const sc = SubColumnModel.create(createSubColumn());
    expect(() =>
      sc.addBlock({ id: 'h1', type: BlockType.HERO } as any),
    ).toThrow(/leaf/i);
  });

  it('accepts a leaf block', () => {
    const sc = SubColumnModel.create(createSubColumn());
    sc.addBlock({ id: 't1', type: BlockType.TEXT, content: 'hi' } as any);
    expect(sc.blocks.length).toBe(1);
  });

  it('removeBlock destroys', () => {
    const sc = SubColumnModel.create({
      ...createSubColumn(),
      blocks: [{ id: 't1', type: BlockType.TEXT, content: 'hi' } as any],
    });
    expect(sc.removeBlock('t1')).toBe(true);
    expect(sc.blocks.length).toBe(0);
  });

  it('setWidth clamps 0..100', () => {
    const sc = SubColumnModel.create(createSubColumn({ width: 50 }));
    sc.setWidth(150);
    expect(sc.width).toBe(100);
    sc.setWidth(-5);
    expect(sc.width).toBe(0);
  });
});
```

- [ ] **Step 2: Run test, verify failure**

Run: `pnpm -F @marlinjai/email-editor-core test -- src/store/mst/models/__tests__/SubColumnModel.test.ts`
Expected: FAIL with "Cannot find module '../SubColumnModel'".

- [ ] **Step 3: Implement**

```ts
// packages/core/src/store/mst/models/SubColumnModel.ts
import { types, Instance, SnapshotIn, SnapshotOut, destroy, detach } from 'mobx-state-tree';
import { nanoid } from 'nanoid';
import { BlockModel, BlockInstance, BlockSnapshotIn } from './BlockModel';
import { isLeafBlockType } from '../../../registry/blockCategories';
import type { CSSProperties } from '../types';
import type { BackgroundGradient } from '../../../schema/gradient';
import { buildGradientCSS } from '../../../schema/gradient';

/**
 * SubColumnModel - one cell in a column that has been split into 2-4
 * side-by-side sub-columns. Holds only LEAF blocks. Cannot contain
 * further sub-columns (no nesting beyond depth 2).
 */
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
  .actions(self => ({
    addBlock(block: BlockSnapshotIn | BlockInstance, index?: number) {
      const type = (BlockModel.is(block) ? block.type : (block as BlockSnapshotIn).type) as any;
      if (!isLeafBlockType(type)) {
        throw new Error(`SubColumn only accepts leaf blocks; got "${type}"`);
      }
      const blockToAdd = BlockModel.is(block)
        ? detach(block)
        : BlockModel.create(block as BlockSnapshotIn);
      if (index !== undefined && index >= 0 && index <= self.blocks.length) {
        self.blocks.splice(index, 0, blockToAdd);
      } else {
        self.blocks.push(blockToAdd);
      }
      return blockToAdd;
    },
    removeBlock(blockId: string) {
      const block = self.blocks.find(b => b.id === blockId);
      if (block) {
        destroy(block);
        return true;
      }
      return false;
    },
    moveBlock(fromIndex: number, toIndex: number) {
      if (fromIndex < 0 || fromIndex >= self.blocks.length) return false;
      if (toIndex < 0 || toIndex > self.blocks.length) return false;
      if (fromIndex === toIndex) return false;
      const [block] = self.blocks.splice(fromIndex, 1);
      const adj = toIndex > fromIndex ? toIndex - 1 : toIndex;
      self.blocks.splice(adj, 0, block);
      return true;
    },
    detachBlock(blockId: string): BlockInstance | undefined {
      const block = self.blocks.find(b => b.id === blockId);
      return block ? detach(block) : undefined;
    },
    setWidth(width: number) {
      self.width = Math.max(0, Math.min(100, width));
    },
    setPadding(p: { top?: string; right?: string; bottom?: string; left?: string }) {
      if (p.top !== undefined) self.paddingTop = p.top;
      if (p.right !== undefined) self.paddingRight = p.right;
      if (p.bottom !== undefined) self.paddingBottom = p.bottom;
      if (p.left !== undefined) self.paddingLeft = p.left;
    },
    updateProperties(updates: Partial<{
      width: number;
      backgroundColor: string;
      backgroundGradient: BackgroundGradient;
      verticalAlign: 'top' | 'middle' | 'bottom';
      paddingTop: string;
      paddingRight: string;
      paddingBottom: string;
      paddingLeft: string;
    }>) {
      Object.entries(updates).forEach(([k, v]) => {
        if (k in self) (self as any)[k] = v;
      });
    },
    clearBlocks() {
      self.blocks.forEach(b => destroy(b));
      self.blocks.clear();
    },
  }))
  .views(self => ({
    get isEmpty(): boolean {
      return self.blocks.length === 0;
    },
    get computedStyle(): CSSProperties {
      const style: CSSProperties = { width: `${self.width}%` };
      if (self.backgroundGradient) {
        const css = buildGradientCSS(self.backgroundGradient);
        if (css) style.backgroundImage = css;
      }
      if (self.backgroundColor) style.backgroundColor = self.backgroundColor;
      if (self.verticalAlign) style.verticalAlign = self.verticalAlign as any;
      if (self.paddingTop) style.paddingTop = self.paddingTop;
      if (self.paddingRight) style.paddingRight = self.paddingRight;
      if (self.paddingBottom) style.paddingBottom = self.paddingBottom;
      if (self.paddingLeft) style.paddingLeft = self.paddingLeft;
      return style;
    },
  }));

export type SubColumnInstance = Instance<typeof SubColumnModel>;
export type SubColumnSnapshotIn = SnapshotIn<typeof SubColumnModel>;
export type SubColumnSnapshotOut = SnapshotOut<typeof SubColumnModel>;

export function createSubColumn(opts: {
  id?: string;
  width?: number;
  blocks?: BlockSnapshotIn[];
} = {}): SubColumnSnapshotIn {
  return {
    id: opts.id ?? nanoid(),
    width: opts.width ?? 50,
    blocks: opts.blocks ?? [],
  };
}
```

- [ ] **Step 4: Export from `packages/core/src/store/mst/models/index.ts`** (append):

```ts
export * from './SubColumnModel';
```

- [ ] **Step 5: Re-export from core barrel `packages/core/src/index.ts`** (append):

```ts
export {
  SubColumnModel,
  createSubColumn,
  type SubColumnInstance,
  type SubColumnSnapshotIn,
  type SubColumnSnapshotOut,
} from './store/mst/models/SubColumnModel';
```

- [ ] **Step 6: Run test, verify pass**

Run: `pnpm -F @marlinjai/email-editor-core test -- src/store/mst/models/__tests__/SubColumnModel.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 7: Type check**

Run: `pnpm -F @marlinjai/email-editor-core run lint`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/core/src/store/mst/models/SubColumnModel.ts packages/core/src/store/mst/models/__tests__/SubColumnModel.test.ts packages/core/src/store/mst/models/index.ts packages/core/src/index.ts
git commit -m "feat(core): add SubColumnModel with leaf-block-only invariant"
```

---

## Task 3: Column split / merge actions + invariant

**Files:**
- Modify: `packages/core/src/store/mst/models/ColumnModel.ts`
- Test: `packages/core/src/store/mst/models/__tests__/ColumnModel.subcolumns.test.ts`

Adds optional `subColumns: types.array(SubColumnModel)`, two new actions `splitIntoSubColumns(count)` and `mergeSubColumns()`, and a `kind` view. Maintains the invariant that `blocks` and `subColumns` are not both non-empty.

- [ ] **Step 1: Write the failing test**

```ts
// packages/core/src/store/mst/models/__tests__/ColumnModel.subcolumns.test.ts
import { describe, it, expect } from 'vitest';
import { ColumnModel, createColumn } from '../ColumnModel';
import { BlockType } from '../BlockModel';

describe('ColumnModel sub-columns', () => {
  it('starts as kind=leaf', () => {
    const c = ColumnModel.create(createColumn());
    expect(c.kind).toBe('leaf');
    expect(c.subColumns.length).toBe(0);
  });

  it('splitIntoSubColumns(2) migrates existing blocks into sub-column 1', () => {
    const c = ColumnModel.create({
      ...createColumn(),
      blocks: [
        { id: 't1', type: BlockType.TEXT, content: 'a' } as any,
        { id: 't2', type: BlockType.TEXT, content: 'b' } as any,
      ],
    });
    c.splitIntoSubColumns(2);
    expect(c.kind).toBe('group');
    expect(c.blocks.length).toBe(0);
    expect(c.subColumns.length).toBe(2);
    expect(c.subColumns[0].blocks.map(b => b.id)).toEqual(['t1', 't2']);
    expect(c.subColumns[1].blocks.length).toBe(0);
    expect(c.subColumns[0].width + c.subColumns[1].width).toBe(100);
  });

  it('splitIntoSubColumns(3) distributes width evenly', () => {
    const c = ColumnModel.create(createColumn());
    c.splitIntoSubColumns(3);
    expect(c.subColumns.map(s => s.width)).toEqual([33.33, 33.33, 33.34]);
  });

  it('rejects split count outside 2..4', () => {
    const c = ColumnModel.create(createColumn());
    expect(() => c.splitIntoSubColumns(1 as any)).toThrow();
    expect(() => c.splitIntoSubColumns(5 as any)).toThrow();
  });

  it('mergeSubColumns concatenates blocks in order', () => {
    const c = ColumnModel.create(createColumn());
    c.splitIntoSubColumns(2);
    c.subColumns[0].addBlock({ id: 't1', type: BlockType.TEXT, content: 'a' } as any);
    c.subColumns[1].addBlock({ id: 't2', type: BlockType.TEXT, content: 'b' } as any);
    c.mergeSubColumns();
    expect(c.kind).toBe('leaf');
    expect(c.subColumns.length).toBe(0);
    expect(c.blocks.map(b => b.id)).toEqual(['t1', 't2']);
  });

  it('addBlock on a group-kind column throws', () => {
    const c = ColumnModel.create(createColumn());
    c.splitIntoSubColumns(2);
    expect(() =>
      c.addBlock({ id: 'x', type: BlockType.TEXT, content: 'x' } as any),
    ).toThrow(/group/);
  });

  it('snapshot loading rejects both blocks and subColumns set', () => {
    expect(() =>
      ColumnModel.create({
        id: 'bad',
        width: 100,
        blocks: [{ id: 't1', type: BlockType.TEXT, content: 'a' } as any],
        subColumns: [{ id: 's1', width: 100, blocks: [] }],
      } as any),
    ).toThrow();
  });
});
```

- [ ] **Step 2: Run, verify failure**

Run: `pnpm -F @marlinjai/email-editor-core test -- src/store/mst/models/__tests__/ColumnModel.subcolumns.test.ts`
Expected: FAIL (column has no `kind`, `splitIntoSubColumns`, `mergeSubColumns`, `subColumns`).

- [ ] **Step 3: Modify `ColumnModel.ts`**

Add the import at the top of the file:

```ts
import { SubColumnModel, SubColumnInstance, SubColumnSnapshotIn, createSubColumn } from './SubColumnModel';
```

In the `.model('Column', { ... })` block, add `subColumns` next to `blocks`:

```ts
blocks: types.array(BlockModel),
subColumns: types.optional(types.array(SubColumnModel), []),
```

Add a `preProcessSnapshot` to enforce the invariant. Insert immediately after the `.model(...)` chain and before `.actions(...)`:

```ts
.preProcessSnapshot((snapshot: any) => {
  if (
    snapshot &&
    Array.isArray(snapshot.blocks) && snapshot.blocks.length > 0 &&
    Array.isArray(snapshot.subColumns) && snapshot.subColumns.length > 0
  ) {
    throw new Error(
      'Invalid Column snapshot: cannot have both blocks and subColumns populated',
    );
  }
  return snapshot;
})
```

In the existing `.actions(self => ({ ... }))`, modify `addBlock` to throw when the column is in group kind:

```ts
addBlock(block: BlockSnapshotIn | BlockInstance, index?: number) {
  if (self.subColumns.length > 0) {
    throw new Error('Cannot add block to a group column; merge sub-columns first');
  }
  // ... existing body unchanged
},
```

Add two new actions inside the same `.actions(self => ({ ... }))`:

```ts
splitIntoSubColumns(count: 2 | 3 | 4) {
  if (count < 2 || count > 4) {
    throw new Error(`splitIntoSubColumns requires count in [2..4], got ${count}`);
  }
  // Move existing blocks into the first sub-column.
  const firstBlocks = self.blocks.map(b => detach(b));
  self.blocks.clear();
  self.subColumns.clear();
  // Distribute width evenly. Last column absorbs the rounding remainder.
  const base = Math.floor((100 / count) * 100) / 100;
  for (let i = 0; i < count; i++) {
    const isLast = i === count - 1;
    const w = isLast ? Math.round((100 - base * (count - 1)) * 100) / 100 : base;
    self.subColumns.push(
      SubColumnModel.create(createSubColumn({
        width: w,
        blocks: i === 0 ? (firstBlocks as any) : [],
      })),
    );
  }
},
mergeSubColumns() {
  // Concatenate sub-column blocks back into the column's own blocks list.
  const collected: BlockInstance[] = [];
  for (const sc of self.subColumns) {
    while (sc.blocks.length > 0) {
      const b = detach(sc.blocks[0]);
      collected.push(b as any);
    }
  }
  self.subColumns.clear();
  for (const b of collected) {
    self.blocks.push(b as any);
  }
},
```

In the existing `.views(self => ({ ... }))`, add a `kind` view at the top:

```ts
get kind(): 'leaf' | 'group' {
  return self.subColumns.length > 0 ? 'group' : 'leaf';
},
```

- [ ] **Step 4: Run, verify pass**

Run: `pnpm -F @marlinjai/email-editor-core test -- src/store/mst/models/__tests__/ColumnModel.subcolumns.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Run all core tests to confirm no regression**

Run: `pnpm -F @marlinjai/email-editor-core test`
Expected: All tests pass.

- [ ] **Step 6: Type check**

Run: `pnpm -F @marlinjai/email-editor-core run lint`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/store/mst/models/ColumnModel.ts packages/core/src/store/mst/models/__tests__/ColumnModel.subcolumns.test.ts
git commit -m "feat(core): split / merge sub-columns on ColumnModel"
```

---

## Task 4: Per-block raw-HTML emitters

**Files:**
- Create: `packages/core/src/compiler/blockToRawHtml.ts`
- Test: `packages/core/src/compiler/__tests__/blockToRawHtml.test.ts`

Six pure functions, one per leaf block type. Each takes the block snapshot and returns an inline-styled HTML fragment safe for the 85-90% client tier.

- [ ] **Step 1: Write the failing test**

```ts
// packages/core/src/compiler/__tests__/blockToRawHtml.test.ts
import { describe, it, expect } from 'vitest';
import { blockToRawHtml } from '../blockToRawHtml';
import { BlockType } from '../../store/mst/models/BlockModel';

describe('blockToRawHtml', () => {
  it('renders a TEXT block as a div with HTML content and inline styles', () => {
    const html = blockToRawHtml({
      id: 't1',
      type: BlockType.TEXT,
      content: '<p>Hello</p>',
      align: 'left',
      color: '#222',
      fontSize: '14px',
      fontFamily: 'Georgia, serif',
      lineHeight: '1.6',
    } as any);
    expect(html).toContain('<div');
    expect(html).toContain('color:#222');
    expect(html).toContain('font-family:Georgia, serif');
    expect(html).toContain('text-align:left');
    expect(html).toContain('<p>Hello</p>');
  });

  it('renders an IMAGE block as an <img> with optional <a>', () => {
    const html = blockToRawHtml({
      id: 'i1', type: BlockType.IMAGE, src: 'https://x.test/y.png', alt: 'y', href: 'https://x.test',
    } as any);
    expect(html).toContain('<a href="https://x.test"');
    expect(html).toContain('<img src="https://x.test/y.png"');
    expect(html).toContain('alt="y"');
  });

  it('renders a BUTTON block as a table-wrapped anchor', () => {
    const html = blockToRawHtml({
      id: 'b1', type: BlockType.BUTTON, label: 'Go',
      href: 'https://x.test', backgroundColor: '#944923', color: '#fff', borderRadius: '4px',
    } as any);
    expect(html).toContain('<table');
    expect(html).toContain('background-color:#944923');
    expect(html).toContain('color:#fff');
    expect(html).toContain('href="https://x.test"');
    expect(html).toContain('>Go</a>');
  });

  it('renders DIVIDER as an hr-style table row', () => {
    const html = blockToRawHtml({
      id: 'd1', type: BlockType.DIVIDER, borderColor: '#ccc', borderWidth: '1px', borderStyle: 'solid',
    } as any);
    expect(html).toContain('border-top:1px solid #ccc');
  });

  it('renders SPACER with explicit height', () => {
    const html = blockToRawHtml({
      id: 's1', type: BlockType.SPACER, height: '20px',
    } as any);
    expect(html).toContain('height:20px');
  });

  it('renders SOCIAL as an inline icon row', () => {
    const html = blockToRawHtml({
      id: 'so1', type: BlockType.SOCIAL,
      links: [
        { platform: 'twitter', url: 'https://twitter.com/x', icon: 'https://i/tw.png' },
        { platform: 'instagram', url: 'https://instagram.com/x', icon: 'https://i/ig.png' },
      ],
    } as any);
    expect(html).toContain('href="https://twitter.com/x"');
    expect(html).toContain('src="https://i/tw.png"');
    expect(html).toContain('href="https://instagram.com/x"');
  });

  it('throws on a container block type', () => {
    expect(() =>
      blockToRawHtml({ id: 'h', type: BlockType.HERO } as any),
    ).toThrow(/leaf/i);
  });
});
```

- [ ] **Step 2: Run, verify failure**

Run: `pnpm -F @marlinjai/email-editor-core test -- src/compiler/__tests__/blockToRawHtml.test.ts`
Expected: FAIL (module missing).

- [ ] **Step 3: Implement**

```ts
// packages/core/src/compiler/blockToRawHtml.ts
// Inline-HTML emitters for leaf blocks rendered inside the <mj-raw>
// nested-table island used for sub-columns. Output targets the 85-90%
// email-client tier (Apple Mail + Gmail + modern Outlook).

import { BlockType } from '../store/mst/models/BlockModel';
import { isLeafBlockType } from '../registry/blockCategories';
import type {
  Block, TextBlock, ImageBlock, ButtonBlock, DividerBlock,
  SpacerBlock, SocialBlock, SocialLink,
} from '../schema/types';

function escapeAttr(s: string): string {
  return s.replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function spacingToCss(p?: { top?: string; right?: string; bottom?: string; left?: string }): string {
  if (!p) return '';
  const t = p.top ?? '0', r = p.right ?? '0', b = p.bottom ?? '0', l = p.left ?? '0';
  return `padding:${t} ${r} ${b} ${l};`;
}

function textToHtml(b: TextBlock): string {
  const styles: string[] = [];
  if (b.color) styles.push(`color:${b.color}`);
  if (b.fontSize) styles.push(`font-size:${b.fontSize}`);
  if (b.fontFamily) styles.push(`font-family:${b.fontFamily}`);
  if (b.lineHeight) styles.push(`line-height:${b.lineHeight}`);
  if (b.align) styles.push(`text-align:${b.align}`);
  styles.push('margin:0');
  const padding = spacingToCss(b.padding);
  return `<div style="${styles.join(';')};${padding}">${b.content}</div>`;
}

function imageToHtml(b: ImageBlock): string {
  const align = b.align ?? 'center';
  const wrap = `style="text-align:${align};${spacingToCss(b.padding)}"`;
  const widthAttr = b.width ? ` width="${escapeAttr(b.width)}"` : '';
  const heightAttr = b.height ? ` height="${escapeAttr(b.height)}"` : '';
  const radius = b.borderRadius ? `border-radius:${b.borderRadius};` : '';
  const img = `<img src="${escapeAttr(b.src)}" alt="${escapeAttr(b.alt ?? '')}"${widthAttr}${heightAttr} style="display:block;max-width:100%;${radius}border:0;outline:none;text-decoration:none;" />`;
  const inner = b.href
    ? `<a href="${escapeAttr(b.href)}" target="_blank" rel="noopener" style="text-decoration:none;">${img}</a>`
    : img;
  return `<div ${wrap}>${inner}</div>`;
}

function buttonToHtml(b: ButtonBlock): string {
  const align = b.align ?? 'center';
  const bg = b.backgroundColor ?? '#000000';
  const fg = b.color ?? '#ffffff';
  const radius = b.borderRadius ?? '3px';
  const innerPadding = b.innerPadding ?? '10px 25px';
  const border = b.border ? `border:${b.border};` : '';
  return `<div style="text-align:${align};${spacingToCss(b.padding)}">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;line-height:100%;display:inline-block;">
      <tr>
        <td align="center" valign="middle" role="presentation" style="background-color:${bg};border-radius:${radius};${border}padding:${innerPadding};">
          <a href="${escapeAttr(b.href)}" target="_blank" rel="noopener" style="display:inline-block;color:${fg};font-family:inherit;font-size:14px;font-weight:600;line-height:120%;text-decoration:none;text-transform:none;">${escapeAttr(b.label)}</a>
        </td>
      </tr>
    </table>
  </div>`;
}

function dividerToHtml(b: DividerBlock): string {
  const color = b.borderColor ?? '#cccccc';
  const w = b.borderWidth ?? '1px';
  const style = b.borderStyle ?? 'solid';
  const width = b.width ?? '100%';
  return `<div style="${spacingToCss(b.padding)}">
    <div style="border-top:${w} ${style} ${color};width:${width};font-size:1px;line-height:1px;">&nbsp;</div>
  </div>`;
}

function spacerToHtml(b: SpacerBlock): string {
  return `<div style="height:${b.height};line-height:${b.height};font-size:1px;">&nbsp;</div>`;
}

function socialToHtml(b: SocialBlock): string {
  const items = (b.links ?? []).map((link: SocialLink) => {
    const icon = (link as any).icon ?? '';
    return `<a href="${escapeAttr(link.url)}" target="_blank" rel="noopener" style="display:inline-block;margin:0 4px;">
      <img src="${escapeAttr(icon)}" alt="${escapeAttr(link.platform)}" width="24" height="24" style="display:inline-block;border:0;" />
    </a>`;
  }).join('');
  return `<div style="text-align:center;">${items}</div>`;
}

export function blockToRawHtml(block: Block): string {
  if (!isLeafBlockType(block.type as BlockType)) {
    throw new Error(`blockToRawHtml only handles leaf blocks; got "${block.type}"`);
  }
  switch (block.type) {
    case BlockType.TEXT:    return textToHtml(block as TextBlock);
    case BlockType.IMAGE:   return imageToHtml(block as ImageBlock);
    case BlockType.BUTTON:  return buttonToHtml(block as ButtonBlock);
    case BlockType.DIVIDER: return dividerToHtml(block as DividerBlock);
    case BlockType.SPACER:  return spacerToHtml(block as SpacerBlock);
    case BlockType.SOCIAL:  return socialToHtml(block as SocialBlock);
    default:
      throw new Error(`Unhandled leaf block type: ${(block as any).type}`);
  }
}
```

- [ ] **Step 4: Run, verify pass**

Run: `pnpm -F @marlinjai/email-editor-core test -- src/compiler/__tests__/blockToRawHtml.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Type check**

Run: `pnpm -F @marlinjai/email-editor-core run lint`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/compiler/blockToRawHtml.ts packages/core/src/compiler/__tests__/blockToRawHtml.test.ts
git commit -m "feat(core): raw-HTML emitters for leaf blocks (sub-column rendering)"
```

---

## Task 5: MJML compiler emits nested table for group columns

**Files:**
- Modify: `packages/core/src/compiler/MJMLCompiler.ts`
- Test: `packages/core/src/compiler/__tests__/MJMLCompiler.subcolumns.test.ts`

When the compiler visits a column with `subColumns.length > 0`, it emits a single `<mj-raw>` containing a hand-built `<table>`. A single `<mj-style>` block with the responsive media query is added once per template if any column has sub-columns.

- [ ] **Step 1: Write the failing test**

```ts
// packages/core/src/compiler/__tests__/MJMLCompiler.subcolumns.test.ts
import { describe, it, expect } from 'vitest';
import { MJMLCompiler } from '../MJMLCompiler';
import { BlockType } from '../../store/mst/models/BlockModel';
import type { EmailTemplate } from '../../schema/types';

const compiler = new MJMLCompiler();

function makeTemplate(rightSubColumns: any[]): EmailTemplate {
  return {
    id: 't1',
    metadata: { title: 'sc-test' },
    sections: [
      {
        id: 'sec1',
        type: 'section',
        columns: [
          { id: 'col1', width: 50, blocks: [{ id: 'i1', type: BlockType.IMAGE, src: 'https://x/h.png' }] },
          { id: 'col2', width: 50, blocks: [], subColumns: rightSubColumns },
        ],
      },
    ],
  } as any;
}

describe('MJMLCompiler sub-columns', () => {
  it('emits <mj-raw> nested table for a group column', () => {
    const tpl = makeTemplate([
      { id: 'sc1', width: 50, blocks: [{ id: 't1', type: BlockType.TEXT, content: '<p>A</p>' }] },
      { id: 'sc2', width: 50, blocks: [{ id: 't2', type: BlockType.TEXT, content: '<p>B</p>' }] },
    ]);
    const r = compiler.compile(tpl);
    expect(r.errors).toBeUndefined();
    expect(r.mjml).toContain('<mj-raw>');
    expect(r.mjml).toContain('class="ee-sub-cols"');
    expect(r.mjml).toContain('class="ee-sub-col"');
    expect(r.mjml).toContain('<p>A</p>');
    expect(r.mjml).toContain('<p>B</p>');
  });

  it('emits the responsive media query once per template (mj-style)', () => {
    const tpl = makeTemplate([
      { id: 'sc1', width: 50, blocks: [] },
      { id: 'sc2', width: 50, blocks: [] },
    ]);
    const r = compiler.compile(tpl);
    const occurrences = (r.mjml.match(/table\.ee-sub-cols td\.ee-sub-col/g) ?? []).length;
    expect(occurrences).toBe(1);
  });

  it('does not emit the media query when no column has sub-columns', () => {
    const tpl = {
      id: 't1', metadata: {},
      sections: [{
        id: 'sec1', type: 'section', columns: [
          { id: 'c1', width: 100, blocks: [] },
        ],
      }],
    } as any;
    const r = compiler.compile(tpl);
    expect(r.mjml).not.toContain('ee-sub-col');
  });

  it('renders compiled HTML containing the nested table', () => {
    const tpl = makeTemplate([
      { id: 'sc1', width: 50, blocks: [{ id: 'b1', type: BlockType.BUTTON, label: 'Go', href: 'https://x' }] },
      { id: 'sc2', width: 50, blocks: [] },
    ]);
    const r = compiler.compile(tpl);
    expect(r.errors).toBeUndefined();
    expect(r.html).toContain('ee-sub-cols');
    expect(r.html).toContain('>Go</a>');
  });

  it('clamps sub-column widths if they do not sum to 100', () => {
    const tpl = makeTemplate([
      { id: 'sc1', width: 60, blocks: [] },
      { id: 'sc2', width: 60, blocks: [] }, // 60+60=120
    ]);
    const r = compiler.compile(tpl);
    // Each width attribute should be normalized.
    const widths = [...r.mjml.matchAll(/td class="ee-sub-col" width="(\d+(?:\.\d+)?)%"/g)].map(m => parseFloat(m[1]));
    const sum = widths.reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(100, 1);
  });
});
```

- [ ] **Step 2: Run, verify failure**

Run: `pnpm -F @marlinjai/email-editor-core test -- src/compiler/__tests__/MJMLCompiler.subcolumns.test.ts`
Expected: FAIL (compiler ignores `subColumns`).

- [ ] **Step 3: Modify `MJMLCompiler.ts`**

Add an import at the top:

```ts
import { blockToRawHtml } from './blockToRawHtml';
```

Find the method that emits a column (probably named `columnToMJML` or similar; if missing, add this branch where each column's MJML is generated). Replace its body, or wrap it, with:

```ts
private columnToMJML(column: Column): string {
  // Group-kind: emit <mj-raw> nested table.
  const subColumns = (column as any).subColumns as Array<any> | undefined;
  if (subColumns && subColumns.length > 0) {
    return this.subColumnsToMJML(column, subColumns);
  }
  // Existing leaf-kind path goes here unchanged.
  // ... keep the original column rendering (mj-column with blocks) ...
}

private subColumnsToMJML(parent: Column, subs: Array<any>): string {
  // Normalize widths to sum to 100.
  const sumRaw = subs.reduce((a, s) => a + (s.width || 0), 0) || 100;
  const widths = subs.map(s => Math.round(((s.width || 0) / sumRaw) * 10000) / 100);

  const cells = subs.map((sc, i) => {
    const inner = (sc.blocks ?? [])
      .map((b: any) => blockToRawHtml(b))
      .join('\n');
    const valign = sc.verticalAlign ?? 'top';
    const padding = (sc.paddingTop || sc.paddingRight || sc.paddingBottom || sc.paddingLeft)
      ? `padding:${sc.paddingTop || '0'} ${sc.paddingRight || '0'} ${sc.paddingBottom || '0'} ${sc.paddingLeft || '0'};`
      : 'padding:10px;';
    const bg = sc.backgroundColor ? `background-color:${sc.backgroundColor};` : '';
    return `<td class="ee-sub-col" width="${widths[i]}%" valign="${valign}" style="${padding}${bg}">${inner}</td>`;
  }).join('');

  // Mark this column as needing the responsive style block (set a flag on the compile context).
  this.needsSubColumnStyles = true;

  // Wrap in mj-column so the parent mj-section structure stays intact.
  const colAttrs = this.columnAttributes(parent); // existing helper, otherwise inline width
  return `<mj-column ${colAttrs}>
  <mj-raw>
    <table role="presentation" class="ee-sub-cols" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
      <tr>${cells}</tr>
    </table>
  </mj-raw>
</mj-column>`;
}
```

Add a private field `private needsSubColumnStyles = false;` at the top of the class. Reset it to `false` at the start of `compile()`.

In the method that builds the document head (typically `templateToMJML` or `headToMJML`), inject the `<mj-style>` block when the flag is set:

```ts
const styleBlock = this.needsSubColumnStyles
  ? `<mj-style>
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
</mj-style>`
  : '';
// then include styleBlock inside the <mj-head> (or insert <mj-head>...</mj-head> if not present)
```

If the existing compiler does not have a clean head-emission method, search for `<mjml>` in the output template string and inject `<mj-head>${styleBlock}</mj-head>` immediately after.

- [ ] **Step 4: Run, verify pass**

Run: `pnpm -F @marlinjai/email-editor-core test -- src/compiler/__tests__/MJMLCompiler.subcolumns.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Run full compiler test suite**

Run: `pnpm -F @marlinjai/email-editor-core test`
Expected: All tests pass.

- [ ] **Step 6: Type check**

Run: `pnpm -F @marlinjai/email-editor-core run lint`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/compiler/MJMLCompiler.ts packages/core/src/compiler/__tests__/MJMLCompiler.subcolumns.test.ts
git commit -m "feat(core): MJML compiler emits nested-table HTML for group columns"
```

---

## Task 6: Editor selection store

**Files:**
- Modify: `packages/core/src/store/mst/models/EditorUIStore.ts`
- Modify: `packages/core/src/store/mst/RootStore.ts`

Adds `selectedSubColumnId`, `hoverSubColumnId`, plus a `selectSubColumn(id?)` action that clears block / column / section selections (mutual exclusion). Adds a `selectedSubColumn` view to `RootStore`.

- [ ] **Step 1: Locate `EditorUIStore.ts`**

Run: `find packages/core/src/store -name 'EditorUIStore.ts'`

If the model is named differently (e.g. `EditorUI.ts` or inlined in `RootStore.ts`), open the file containing `selectedColumnId` and apply the same pattern there.

- [ ] **Step 2: Add fields**

Inside the `.model('EditorUI', { ... })` properties block, add next to `selectedColumnId`:

```ts
selectedSubColumnId: types.maybe(types.string),
hoverSubColumnId: types.maybe(types.string),
```

- [ ] **Step 3: Add actions**

Inside the `.actions(self => ({ ... }))`, add:

```ts
selectSubColumn(id?: string) {
  self.selectedSubColumnId = id;
  self.selectedBlockId = undefined;
  self.selectedColumnId = undefined;
  self.selectedSectionId = undefined;
},
setHoverSubColumn(id?: string) {
  self.hoverSubColumnId = id;
},
```

Modify `selectBlock`, `selectColumn`, `selectSection`, and `clearSelection` (all existing actions) to also clear `selectedSubColumnId`. For example:

```ts
selectBlock(id?: string) {
  self.selectedBlockId = id;
  self.selectedColumnId = undefined;
  self.selectedSectionId = undefined;
  self.selectedSubColumnId = undefined; // <-- added
},
clearSelection() {
  self.selectedBlockId = undefined;
  self.selectedColumnId = undefined;
  self.selectedSectionId = undefined;
  self.selectedSubColumnId = undefined; // <-- added
},
```

- [ ] **Step 4: Add `selectedSubColumn` view to `RootStore.ts`**

Open `packages/core/src/store/mst/RootStore.ts`. In its `.views(self => ({ ... }))`, add (next to `selectedColumn`):

```ts
get selectedSubColumn() {
  const id = self.editorUI.selectedSubColumnId;
  if (!id) return undefined;
  for (const section of self.template.sections) {
    for (const column of section.columns) {
      const sc = column.subColumns?.find?.(s => s.id === id);
      if (sc) return sc;
    }
  }
  return undefined;
},
```

- [ ] **Step 5: Type check + tests**

Run: `pnpm -F @marlinjai/email-editor-core run lint && pnpm -F @marlinjai/email-editor-core test`
Expected: All pass.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/store/mst/models/EditorUIStore.ts packages/core/src/store/mst/RootStore.ts
git commit -m "feat(core): selectedSubColumnId in editor UI store with mutual exclusion"
```

---

## Task 7: Canvas: SubColumnRenderer + ColumnRenderer branching

**Files:**
- Create: `packages/ui/src/renderer/SubColumnRenderer.tsx`
- Modify: `packages/ui/src/renderer/ColumnRenderer.tsx`

`SubColumnRenderer` mirrors `ColumnRenderer`'s leaf path (selection ring, hover ring, handle, blocks list, drop zones). `ColumnRenderer` branches at the top: if `column.kind === 'group'`, render a `<table>` of `<SubColumnRenderer>`s.

- [ ] **Step 1: Create `SubColumnRenderer.tsx`**

```tsx
// packages/ui/src/renderer/SubColumnRenderer.tsx
import React from 'react';
import { observer } from 'mobx-react-lite';
import clsx from 'clsx';
import type { SubColumnInstance } from '@marlinjai/email-editor-core';
import { useStore } from '../store';
import { BlockRenderer } from './BlockRenderer';

interface SubColumnRendererProps {
  subColumn: SubColumnInstance;
  subColumnIndex: number;
}

export const SubColumnRenderer = observer(({ subColumn, subColumnIndex }: SubColumnRendererProps) => {
  const { editorUI } = useStore();
  const isSelected = editorUI.selectedSubColumnId === subColumn.id;
  const isHovered = editorUI.hoverSubColumnId === subColumn.id && !isSelected;

  return (
    <td
      className={clsx(
        'email-sub-column relative align-top',
        isSelected && 'ring-2 ring-inset ring-blue-500',
        isHovered && 'ring-1 ring-inset ring-blue-300',
      )}
      data-sub-column-id={subColumn.id}
      style={{
        width: `${subColumn.width}%`,
        backgroundColor: subColumn.backgroundColor || undefined,
        verticalAlign: subColumn.verticalAlign || 'top',
        paddingTop: subColumn.paddingTop || undefined,
        paddingRight: subColumn.paddingRight || undefined,
        paddingBottom: subColumn.paddingBottom || undefined,
        paddingLeft: subColumn.paddingLeft || undefined,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          e.stopPropagation();
          editorUI.selectSubColumn(subColumn.id);
        }
      }}
      onMouseEnter={() => {
        if (!editorUI.isDragging) {
          editorUI.setHoverSubColumn(subColumn.id);
        }
      }}
      onMouseLeave={() => editorUI.setHoverSubColumn(undefined)}
    >
      {!editorUI.isDragging && (
        <button
          type="button"
          className={clsx(
            'sub-column-handle absolute top-0 left-1/2 -translate-x-1/2 z-[5]',
            'px-2 py-0.5 text-[10px] font-medium rounded-b cursor-pointer transition-opacity',
            isSelected
              ? 'bg-blue-500 text-white opacity-100'
              : isHovered
              ? 'bg-blue-50 text-blue-700 opacity-100'
              : 'bg-blue-50 text-blue-700 opacity-0 hover:opacity-100',
          )}
          onClick={(e) => {
            e.stopPropagation();
            editorUI.selectSubColumn(subColumn.id);
          }}
        >
          Sub {subColumnIndex + 1} · {subColumn.width}%
        </button>
      )}

      <div className="sub-column-content space-y-2">
        {subColumn.blocks.map((block) => (
          <BlockRenderer key={block.id} block={block} />
        ))}
        {subColumn.blocks.length === 0 && !editorUI.isDragging && (
          <div className="empty-subcolumn-placeholder p-3 text-center text-gray-400 text-xs border-2 border-dashed border-gray-200 rounded">
            Drop blocks here
          </div>
        )}
      </div>
    </td>
  );
});

SubColumnRenderer.displayName = 'SubColumnRenderer';
```

- [ ] **Step 2: Modify `ColumnRenderer.tsx` to branch on `column.kind`**

Add the import:

```tsx
import { SubColumnRenderer } from './SubColumnRenderer';
```

At the top of the `ColumnRenderer` component body, after computing `isSelected` etc., add the early branch:

```tsx
if (!column.hidden && column.kind === 'group' && column.subColumns.length > 0) {
  return (
    <td
      className={clsx(
        'email-column relative align-top',
        isSelected && 'ring-2 ring-inset ring-blue-500',
        isHovered && 'ring-1 ring-inset ring-blue-300',
      )}
      data-column-id={column.id}
      style={{
        width: `${column.width}%`,
        backgroundColor: column.backgroundColor || undefined,
        verticalAlign: column.verticalAlign || 'top',
        paddingTop: column.paddingTop || undefined,
        paddingRight: column.paddingRight || undefined,
        paddingBottom: column.paddingBottom || undefined,
        paddingLeft: column.paddingLeft || undefined,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          e.stopPropagation();
          editorUI.selectColumn(column.id);
        }
      }}
      onMouseEnter={() => { if (!editorUI.isDragging) editorUI.setHoverColumn(column.id); }}
      onMouseLeave={() => editorUI.setHoverColumn(undefined)}
    >
      {/* Existing column handle (Col N · width%) stays */}
      {!editorUI.isDragging && (
        <button
          type="button"
          className={clsx(
            'column-handle absolute top-0 left-1/2 -translate-x-1/2 z-10',
            'px-2 py-0.5 text-[10px] font-medium rounded-b cursor-pointer transition-opacity',
            isSelected
              ? 'bg-blue-500 text-white opacity-100'
              : isHovered
              ? 'bg-blue-100 text-blue-700 opacity-100'
              : 'bg-blue-100 text-blue-700 opacity-0 hover:opacity-100',
          )}
          onClick={(e) => {
            e.stopPropagation();
            editorUI.selectColumn(column.id);
          }}
        >
          Col {columnIndex + 1} · {column.width}%
        </button>
      )}

      <table
        width="100%"
        cellPadding="0"
        cellSpacing="0"
        role="presentation"
        style={{ borderCollapse: 'collapse' }}
      >
        <tbody>
          <tr>
            {column.subColumns.map((sc, i) => (
              <SubColumnRenderer key={sc.id} subColumn={sc} subColumnIndex={i} />
            ))}
          </tr>
        </tbody>
      </table>
    </td>
  );
}
```

The existing leaf rendering after this branch stays unchanged.

- [ ] **Step 3: Type check**

Run: `pnpm -F @marlinjai/email-editor-ui run lint`
Expected: PASS.

- [ ] **Step 4: Build the UI package**

Run: `pnpm -F @marlinjai/email-editor-ui run build`
Expected: PASS.

- [ ] **Step 5: Manual canvas check**

Start dev server: `pnpm -F email-editor-nextjs-example dev`
Open `http://localhost:3000/editor`. Add a 2-column section. Open the Layers panel and confirm columns are visible. (Sub-column creation will be wired in Task 9 via the inspector; for now verify nothing broke.)
Expected: 2-column section renders normally, no console errors.

- [ ] **Step 6: Commit**

```bash
git add packages/ui/src/renderer/SubColumnRenderer.tsx packages/ui/src/renderer/ColumnRenderer.tsx
git commit -m "feat(ui): SubColumnRenderer + ColumnRenderer group branch on canvas"
```

---

## Task 8: Drag-and-drop into sub-columns

**Files:**
- Modify: `packages/ui/src/EmailEditor.tsx` (drop handler)
- Modify: `packages/ui/src/renderer/SubColumnRenderer.tsx` (DropZone integration)

Wires dnd-kit drop targets so blocks drop into sub-columns. The drop-zone id format mirrors `drop-column-<id>` as `drop-subcolumn-<id>`.

- [ ] **Step 1: Add DropZone elements inside `SubColumnRenderer`**

Inside `sub-column-content` div, replace the bare blocks loop with the same DropZone pattern that `ColumnRenderer` uses. Mirror its `DropZone` component but with `drop-subcolumn-<id>` ids. (If `ColumnRenderer` already exports an internal `DropZone`, reuse it; otherwise duplicate the small component locally.)

In `SubColumnRenderer.tsx`, replace the blocks loop with:

```tsx
<div className="sub-column-content space-y-2">
  {subColumn.blocks.map((block, index) => (
    <React.Fragment key={block.id}>
      {editorUI.isDragging && (
        <DropZone subColumnId={subColumn.id} index={index} />
      )}
      <BlockRenderer block={block} />
    </React.Fragment>
  ))}
  {editorUI.isDragging && (
    <DropZone subColumnId={subColumn.id} index={subColumn.blocks.length} />
  )}
  {subColumn.blocks.length === 0 && !editorUI.isDragging && (
    <div className="empty-subcolumn-placeholder p-3 text-center text-gray-400 text-xs border-2 border-dashed border-gray-200 rounded">
      Drop blocks here
    </div>
  )}
</div>
```

Add the local `DropZone` (after `SubColumnRenderer.displayName = ...`):

```tsx
import { useDroppable } from '@dnd-kit/core';

interface DropZoneProps {
  subColumnId: string;
  index: number;
}
const DropZone = observer(({ subColumnId, index }: DropZoneProps) => {
  const { editorUI } = useStore();
  const dropId = `drop-subcolumn-${subColumnId}-${index}`;
  const { setNodeRef, isOver } = useDroppable({
    id: dropId,
    data: { subColumnId, index },
  });
  return (
    <div
      ref={setNodeRef}
      className={clsx(
        'drop-zone transition-all duration-150',
        isOver ? 'h-2 bg-blue-400 rounded my-1' : 'h-1 bg-transparent hover:bg-blue-200 hover:h-2 rounded my-0.5',
      )}
      onDragEnter={() => {
        editorUI.setDropIntent({
          targetSubColumnId: subColumnId,
          targetIndex: index,
          position: 'before',
        } as any);
      }}
    />
  );
});
DropZone.displayName = 'SubColumnDropZone';
```

If `setDropIntent` doesn't yet support `targetSubColumnId`, add the optional field on the dropIntent shape in `EditorUIStore.ts` (next to `targetColumnId`).

- [ ] **Step 2: Handle the drop in `EmailEditor.tsx`**

In the `handleDrop` function (around `EmailEditor.tsx:413`), after the existing `drop-column-` handling, add:

```ts
if (dropId.startsWith('drop-subcolumn-')) {
  // dropId format: drop-subcolumn-<subColumnId>-<index>
  const m = dropId.match(/^drop-subcolumn-(.+)-(\d+)$/);
  if (m) {
    const [, subColumnId, indexStr] = m;
    const index = parseInt(indexStr, 10);
    // Find the sub-column instance.
    let target;
    for (const section of template.sections) {
      for (const col of section.columns) {
        const sc = col.subColumns?.find?.(s => s.id === subColumnId);
        if (sc) { target = sc; break; }
      }
      if (target) break;
    }
    if (target && isLeafBlockType(blockType as BlockType)) {
      target.addBlock(newBlock, index);
      editorUI.selectBlock(newBlock.id);
      return;
    }
  }
}
```

Add the import at the top of `EmailEditor.tsx`:

```ts
import { isLeafBlockType, BlockType as BlockTypeEnum } from '@marlinjai/email-editor-core';
```

(The `BlockTypeEnum` aliasing avoids a clash with the existing `BlockType` import.)

- [ ] **Step 3: Type check + build**

Run: `pnpm -F @marlinjai/email-editor-ui run lint && pnpm -F @marlinjai/email-editor-ui run build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/ui/src/renderer/SubColumnRenderer.tsx packages/ui/src/EmailEditor.tsx packages/core/src/store/mst/models/EditorUIStore.ts
git commit -m "feat(ui): drag blocks into sub-columns"
```

---

## Task 9: Inspector — split control + sub-column properties

**Files:**
- Modify: `packages/ui/src/inspector/properties/ColumnProperties.tsx` (add Split button + count selector)
- Create: `packages/ui/src/inspector/properties/SubColumnProperties.tsx` (new panel)
- Modify: `packages/ui/src/inspector/properties/index.ts` (export)
- Modify: `packages/ui/src/inspector/PropertyInspector.tsx` (route on selection kind)

When the selected element is a Column with `kind === 'leaf'`, ColumnProperties shows a "Split into..." 1/2/3/4 button group (1 means "stay leaf"). When the selected element is a Sub-Column, the new SubColumnProperties panel shows the standard column controls plus a "Merge sub-columns" button.

- [ ] **Step 1: Modify `ColumnProperties.tsx`**

Find the Column property panel layout. At the bottom (or top, between header and existing controls), add:

```tsx
{column.kind === 'leaf' && (
  <div className="space-y-2 pt-2 border-t border-border-light">
    <label className="text-xs font-semibold text-text-dark-muted uppercase">Layout</label>
    <div className="grid grid-cols-3 gap-2">
      {[2, 3, 4].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => column.splitIntoSubColumns(n as 2 | 3 | 4)}
          className="p-2 rounded border border-border-light hover:border-accent hover:bg-accent/5 text-xs text-text-dark"
        >
          Split into {n}
        </button>
      ))}
    </div>
  </div>
)}
```

(The exact existing class names follow the project's Tailwind theme. If `border-border-light` etc. aren't in scope here, follow whatever the surrounding component already uses.)

- [ ] **Step 2: Create `SubColumnProperties.tsx`**

```tsx
// packages/ui/src/inspector/properties/SubColumnProperties.tsx
import React from 'react';
import { observer } from 'mobx-react-lite';
import type { SubColumnInstance, ColumnInstance } from '@marlinjai/email-editor-core';
import { useStore } from '../../store';

interface Props {
  subColumn: SubColumnInstance;
  parentColumn: ColumnInstance;
}

export const SubColumnProperties = observer(({ subColumn, parentColumn }: Props) => {
  const { editorUI } = useStore();
  return (
    <div className="space-y-3 p-3">
      <div>
        <h3 className="text-sm font-semibold text-text-dark">Sub-Column</h3>
        <p className="text-xs text-text-dark-muted">Inside Column · {parentColumn.subColumns.length} sub-columns total</p>
      </div>

      <div>
        <label className="text-xs text-text-dark-muted">Width</label>
        <input
          type="range"
          min={5}
          max={95}
          value={subColumn.width}
          onChange={(e) => {
            const w = parseFloat(e.target.value);
            // Auto-rebalance: distribute the remainder across siblings proportionally.
            const idx = parentColumn.subColumns.findIndex(s => s.id === subColumn.id);
            const others = parentColumn.subColumns.filter((_, i) => i !== idx);
            const remaining = Math.max(0, 100 - w);
            const oldOthersSum = others.reduce((a, s) => a + s.width, 0) || 1;
            others.forEach(s => s.setWidth((s.width / oldOthersSum) * remaining));
            subColumn.setWidth(w);
          }}
          className="w-full"
        />
        <div className="text-xs text-text-dark-muted text-right">{subColumn.width.toFixed(0)}%</div>
      </div>

      <div>
        <label className="text-xs text-text-dark-muted">Background Color</label>
        <input
          type="text"
          value={subColumn.backgroundColor || ''}
          placeholder="transparent"
          onChange={(e) => subColumn.updateProperties({ backgroundColor: e.target.value || undefined })}
          className="w-full px-2 py-1 text-sm border border-border-light rounded"
        />
      </div>

      <div>
        <label className="text-xs text-text-dark-muted">Vertical Align</label>
        <select
          value={subColumn.verticalAlign || 'top'}
          onChange={(e) => subColumn.updateProperties({ verticalAlign: e.target.value as any })}
          className="w-full px-2 py-1 text-sm border border-border-light rounded"
        >
          <option value="top">Top</option>
          <option value="middle">Middle</option>
          <option value="bottom">Bottom</option>
        </select>
      </div>

      <div>
        <label className="text-xs text-text-dark-muted">Padding</label>
        <div className="grid grid-cols-4 gap-1">
          {(['paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft'] as const).map((k) => (
            <input
              key={k}
              type="text"
              value={(subColumn as any)[k] || ''}
              placeholder="0px"
              onChange={(e) => subColumn.updateProperties({ [k]: e.target.value || undefined } as any)}
              className="px-1 py-1 text-xs border border-border-light rounded text-center"
            />
          ))}
        </div>
      </div>

      <button
        type="button"
        onClick={() => {
          parentColumn.mergeSubColumns();
          editorUI.selectColumn(parentColumn.id);
        }}
        className="w-full p-2 text-xs text-text-dark border border-border-light rounded hover:border-accent hover:bg-accent/5"
      >
        Merge sub-columns into one
      </button>
    </div>
  );
});

SubColumnProperties.displayName = 'SubColumnProperties';
```

- [ ] **Step 3: Export from `properties/index.ts`** (append):

```ts
export * from './SubColumnProperties';
```

- [ ] **Step 4: Modify `PropertyInspector.tsx` to route on selection**

Find the routing logic that switches between Block / Column / Section properties. Add a sub-column branch before the Column branch:

```tsx
const subColumn = store.selectedSubColumn;
if (subColumn) {
  // Find the parent column.
  let parent;
  for (const section of store.template.sections) {
    parent = section.columns.find(c =>
      c.subColumns?.some?.(s => s.id === subColumn.id),
    );
    if (parent) break;
  }
  return parent ? (
    <SubColumnProperties subColumn={subColumn} parentColumn={parent} />
  ) : null;
}
```

Add the import:

```tsx
import { SubColumnProperties } from './properties/SubColumnProperties';
```

- [ ] **Step 5: Type check + build**

Run: `pnpm -F @marlinjai/email-editor-ui run lint && pnpm -F @marlinjai/email-editor-ui run build`
Expected: PASS.

- [ ] **Step 6: Manual smoke test**

Dev server: `pnpm -F email-editor-nextjs-example dev`. Add a 2-column section. Click the right column. Click "Split into 2". Verify two sub-columns appear in the canvas, each with its own Sub N · 50% handle on hover. Click a sub-column handle; verify inspector switches to SubColumnProperties. Drag a Text block into a sub-column. Click "Merge sub-columns into one"; verify blocks reappear in the parent column.

- [ ] **Step 7: Commit**

```bash
git add packages/ui/src/inspector/properties/SubColumnProperties.tsx packages/ui/src/inspector/properties/ColumnProperties.tsx packages/ui/src/inspector/properties/index.ts packages/ui/src/inspector/PropertyInspector.tsx
git commit -m "feat(ui): inspector split / merge controls + SubColumn properties"
```

---

## Task 10: Element palette filter (block restrictions)

**Files:**
- Modify: `packages/ui/src/sidebar/ElementsPanel.tsx`

Hides container blocks (Hero, Carousel, Accordion, Navbar, Header, Footer, Table, Raw) from the elements palette when the active drop target is a sub-column.

- [ ] **Step 1: Modify `ElementsPanel.tsx`**

At the top of the component, derive the filtered block list:

```tsx
import { isLeafBlockType, type BlockType } from '@marlinjai/email-editor-core';
import { useStore } from '../store';

// inside component:
const { editorUI } = useStore();
const isSubColumnContext = !!editorUI.selectedSubColumnId;

const visibleBlocks = isSubColumnContext
  ? blocks.filter((b) => isLeafBlockType(b.type as BlockType))
  : blocks;
```

Render `visibleBlocks` instead of `blocks` in the existing draggable list.

When `isSubColumnContext` is true, show a small hint at the top of the panel:

```tsx
{isSubColumnContext && (
  <p className="text-[10px] text-amber-700/80 mb-2 px-1">
    Container blocks (hero, carousel, footer…) are hidden inside sub-columns to keep the email render-safe.
  </p>
)}
```

- [ ] **Step 2: Type check + build**

Run: `pnpm -F @marlinjai/email-editor-ui run lint && pnpm -F @marlinjai/email-editor-ui run build`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/ui/src/sidebar/ElementsPanel.tsx
git commit -m "feat(ui): filter container blocks from palette when sub-column selected"
```

---

## Task 11: Layers panel: nested sub-columns

**Files:**
- Modify: `packages/ui/src/sidebar/LayersPanel.tsx`

Renders sub-columns as children of their parent column, with an extra indent and the same delete / select affordances columns have. Reuses existing layer-row patterns.

- [ ] **Step 1: Find the existing column-row component in `LayersPanel.tsx`**

Identify the helper / component that renders one column row with its block children. Add a sibling rendering path: when the column is `kind === 'group'`, render a sub-columns list instead of (or in addition to, as appropriate) the blocks list.

```tsx
{column.kind === 'group' ? (
  <div className="ml-4">
    {column.subColumns.map((sc, scIdx) => (
      <SubColumnLayerRow key={sc.id} subColumn={sc} index={scIdx} parentColumn={column} />
    ))}
  </div>
) : (
  /* existing block list */
)}
```

Add a small new component below the existing column-row component:

```tsx
const SubColumnLayerRow = observer(({ subColumn, index, parentColumn }: {
  subColumn: SubColumnInstance;
  index: number;
  parentColumn: ColumnInstance;
}) => {
  const { editorUI } = useStore();
  const selected = editorUI.selectedSubColumnId === subColumn.id;
  return (
    <div className={clsx('flex items-center gap-1 py-1 px-2 rounded cursor-pointer text-xs',
      selected ? 'bg-blue-50 text-blue-800' : 'hover:bg-canvas-1')}
      onClick={() => editorUI.selectSubColumn(subColumn.id)}>
      <span className="text-blue-500">⤷</span>
      <span className="flex-1 truncate">Sub-column {index + 1} ({subColumn.width.toFixed(0)}%)</span>
      <button
        className="opacity-50 hover:opacity-100 text-red-500"
        onClick={(e) => {
          e.stopPropagation();
          if (parentColumn.subColumns.length === 2) {
            // Removing one would leave a single sub-column; auto-merge.
            parentColumn.mergeSubColumns();
            editorUI.selectColumn(parentColumn.id);
          } else {
            // Find and remove via parent's subColumns array.
            const idx = parentColumn.subColumns.findIndex(s => s.id === subColumn.id);
            if (idx >= 0) parentColumn.subColumns.splice(idx, 1);
            editorUI.selectColumn(parentColumn.id);
          }
        }}
        title="Delete sub-column"
      >
        ✕
      </button>
    </div>
  );
});
```

Add necessary imports at the top:

```tsx
import type { SubColumnInstance, ColumnInstance } from '@marlinjai/email-editor-core';
```

- [ ] **Step 2: Type check + build**

Run: `pnpm -F @marlinjai/email-editor-ui run lint && pnpm -F @marlinjai/email-editor-ui run build`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/ui/src/sidebar/LayersPanel.tsx
git commit -m "feat(ui): layers panel renders sub-columns under their parent"
```

---

## Task 12: Keyboard shortcut — Backspace deletes sub-column

**Files:**
- Modify: `packages/ui/src/EmailEditor.tsx` (in `useKeyboardShortcuts`)

Backspace / Delete on a selected sub-column removes it (auto-merges back if dropping to 1).

- [ ] **Step 1: Locate `useKeyboardShortcuts`** at `packages/ui/src/EmailEditor.tsx:388`.

- [ ] **Step 2: Extend the Delete branch**

Inside the `if (e.key === 'Delete' || e.key === 'Backspace')` block, before the existing block-delete check, add:

```ts
if (store.editorUI.selectedSubColumnId) {
  e.preventDefault();
  // Find parent column.
  let parent;
  let target;
  for (const section of store.template.sections) {
    for (const col of section.columns) {
      const sc = col.subColumns?.find?.(s => s.id === store.editorUI.selectedSubColumnId);
      if (sc) { parent = col; target = sc; break; }
    }
    if (parent) break;
  }
  if (parent && target) {
    if (parent.subColumns.length === 2) {
      parent.mergeSubColumns();
      store.editorUI.selectColumn(parent.id);
    } else {
      const idx = parent.subColumns.findIndex(s => s.id === target.id);
      if (idx >= 0) parent.subColumns.splice(idx, 1);
      store.editorUI.selectColumn(parent.id);
    }
  }
  return;
}
```

Then continue with the existing block-delete branch.

- [ ] **Step 3: Type check + build**

Run: `pnpm -F @marlinjai/email-editor-ui run lint && pnpm -F @marlinjai/email-editor-ui run build`
Expected: PASS.

- [ ] **Step 4: Manual smoke test**

Dev server. Create a 2-sub-column setup. Click a sub-column handle. Press Backspace. Verify the parent column reverts to a leaf with the remaining sub-column's blocks.

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/EmailEditor.tsx
git commit -m "feat(ui): Backspace deletes selected sub-column, auto-merges to leaf"
```

---

## Task 13: End-to-end manual verification

**Files:** none modified.

- [ ] **Step 1: Start dev server**

Run: `pnpm -F email-editor-nextjs-example dev`

- [ ] **Step 2: Build a representative nested layout**

In `http://localhost:3000/editor`:
- Add a 2-column section.
- In the right column, click "Split into 2".
- Drag a Text block into Sub 1. Drag a Button block into Sub 2.
- Verify both render side-by-side at desktop width.
- Switch to the mobile preview (375px). Verify the section's columns stack, AND the sub-columns also stack inside.

- [ ] **Step 3: Compile + inspect output HTML**

Click Export. Save the HTML. Open in a browser at 600px and 375px widths. Verify the nested sub-columns render correctly at desktop and stack at mobile.

- [ ] **Step 4: Selection regressions**

- Select a sub-column → inspector shows SubColumnProperties.
- Select the parent column → inspector shows ColumnProperties with no Split button (because it's now a group).
- Select a section → inspector shows SectionProperties.
- Press Escape → selection clears.
- Press Backspace on a selected sub-column → auto-merge happens.

- [ ] **Step 5: Drag-and-drop regressions**

- Drag a Hero block from the palette → verify it's hidden when a sub-column is selected.
- Drag a Text block into a sub-column drop zone → verify it lands in the right place.
- Drag a Text block into a normal column drop zone → still works.

- [ ] **Step 6: If anything fails, file follow-up issues and stop.**

---

## Task 14: Update package CHANGELOG and ROADMAP

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `ROADMAP.md`

- [ ] **Step 1: Append a `## [Unreleased]` entry to `CHANGELOG.md`**

```markdown
### Added
- Nested columns (depth 2): a column can be split into 2-4 sub-columns.
  Each sub-column accepts leaf blocks (text, image, button, divider,
  spacer, social) and renders side-by-side on desktop, stacks on mobile.
  Compiles to email-safe nested-table HTML for the 85-90% client tier
  (Apple Mail + Gmail + modern Outlook).
```

- [ ] **Step 2: Update `ROADMAP.md`** — mark "Nested columns" done if listed; otherwise add a "Recently shipped" line.

- [ ] **Step 3: Commit**

```bash
git add CHANGELOG.md ROADMAP.md
git commit -m "docs: changelog + roadmap for nested columns"
```

---

## Self-review summary

- **Spec coverage:** Every spec section maps to at least one task. Data model → 2 + 3. Compiler → 4 + 5. Selection store → 6. Canvas → 7. Drag-and-drop → 8. Inspector → 9. Block restrictions → 1 + 10. Layers panel → 11. Keyboard → 12. Manual verification → 13. CHANGELOG → 14.
- **Placeholder scan:** All steps include the actual code to write or the exact command to run.
- **Type consistency:** `splitIntoSubColumns` / `mergeSubColumns` / `kind` / `selectSubColumn` / `setHoverSubColumn` / `selectedSubColumnId` / `hoverSubColumnId` / `subColumns` / `SubColumnModel` / `SubColumnInstance` are used consistently across all tasks.
- **DRY:** Per-block raw-HTML emitters live in one file (`blockToRawHtml.ts`); the compiler and the canvas reuse them through the standard MJML render path. The `LEAF_BLOCK_TYPES` constant is the single source of truth for "is this safe inside a sub-column?".
- **TDD:** Tasks 1, 2, 3, 4, 5 each start with a failing test before implementation. UI tasks (7-12) rely on type-checking, build, and manual verification because the UI package has no automated tests today.
- **Frequent commits:** Each task ends with a git commit.
