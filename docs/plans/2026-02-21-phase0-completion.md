---
title: Phase 0 Completion — Implementation Plan
summary: Implementation plan to complete the email-editor foundation by renaming packages to @marlinjai/ scope, implementing 6 missing block renderers, and adding Vitest test coverage across the monorepo.
category: plan
tags: [email-editor, implementation, block-renderers, testing, monorepo]
projects: [email-editor]
status: active
date: 2026-02-21
---

# Phase 0 Completion — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Complete the email-editor foundation by renaming packages to `@marlinjai/` scope, implementing the 6 missing block renderers, and adding test coverage.

**Architecture:** The email-editor is a pnpm monorepo with 4 packages (core, ui, blocks, editor) plus a Next.js example app. State is managed via MobX State Tree. Block renderers are React components using `observer()` from mobx-react-lite. Tests use Vitest.

**Tech Stack:** TypeScript, React 18/19, MobX State Tree, Vitest, tsup, pnpm workspaces, Tailwind CSS v3

---

## Task 1: Package Rename — `@returnhypnosis/` → `@marlinjai/`

**Goal:** Rename all 5 packages from `@returnhypnosis/` to `@marlinjai/` scope and update every reference across the monorepo.

**Files (package.json name fields):**
- Modify: `package.json` (root monorepo)
- Modify: `packages/core/package.json`
- Modify: `packages/ui/package.json`
- Modify: `packages/blocks/package.json`
- Modify: `packages/editor/package.json`
- Modify: `examples/nextjs/package.json`

**Step 1: Update all package.json name fields**

Replace in each `package.json`:
- `@marlinjai/email-editor-monorepo` → `@marlinjai/email-editor-monorepo`
- `@marlinjai/email-editor-core` → `@marlinjai/email-editor-core`
- `@marlinjai/email-editor-ui` → `@marlinjai/email-editor-ui`
- `@marlinjai/email-editor-blocks` → `@marlinjai/email-editor-blocks`
- `@marlinjai/email-editor` → `@marlinjai/email-editor`

Also update workspace dependency references:
- `"@marlinjai/email-editor-core": "workspace:*"` → `"@marlinjai/email-editor-core": "workspace:*"`
- Same for all other `workspace:*` references in editor, ui, blocks, and nextjs packages

**Step 2: Update all source code imports (57+ files)**

Global find-and-replace across `packages/` and `examples/`:
- `@marlinjai/email-editor-core` → `@marlinjai/email-editor-core`
- `@marlinjai/email-editor-ui` → `@marlinjai/email-editor-ui`
- `@marlinjai/email-editor-blocks` → `@marlinjai/email-editor-blocks`
- `@marlinjai/email-editor` → `@marlinjai/email-editor` (careful: this is a substring of the others — do longer strings first)

Key files with imports:
- `packages/editor/src/index.ts`, `types.ts`, `react.tsx`, `createEditor.ts`
- `packages/ui/src/EmailEditor.tsx`, `store/StoreContext.tsx`
- `packages/ui/src/renderer/BlockRenderer.tsx`, `SectionRenderer.tsx`, `ColumnRenderer.tsx`
- All `packages/ui/src/renderer/blocks/*.tsx` files
- All `packages/ui/src/sidebar/*.tsx` files
- All `packages/ui/src/inspector/properties/*.tsx` files
- All `packages/blocks/src/*/index.ts` files (15 files)
- All `packages/blocks/src/prebuilt/*.ts` files (6 files)
- `packages/blocks/src/registry.ts`
- `examples/nextjs/app/editor/page.tsx`
- `examples/nextjs/app/api/compile/route.ts`
- `examples/nextjs/app/api/save/route.ts`
- `examples/nextjs/app/api/templates/route.ts`
- `examples/nextjs/app/api/templates/[id]/route.ts`

**Step 3: Update config files**

- `examples/nextjs/next.config.ts` — update `transpilePackages` array (4 entries)

**Step 4: Update documentation**

- `README.md` — all install/import examples
- `docs/public/index.md`, `quickstart.md`, `installation.md`, `integration.md`, `api.md`, `architecture.md`
- `examples/nextjs/README.md`
- `.cursor/` files (boundary spec, roadmap, state flow) — best effort, not critical

**Step 5: Regenerate lockfile and verify build**

```bash
cd /path/to/email-editor
rm pnpm-lock.yaml
pnpm install
pnpm run build
```

Expected: All 4 packages build successfully. No `@returnhypnosis/` references remain.

**Step 6: Verify no remaining references**

```bash
grep -r "@returnhypnosis/" --include="*.ts" --include="*.tsx" --include="*.json" --include="*.md" --include="*.mjs" . | grep -v node_modules | grep -v pnpm-lock | grep -v .cursor
```

Expected: Zero results (`.cursor/` files are excluded as non-critical).

**Step 7: Commit**

```bash
git add -A
git commit -m "feat: rename packages from @returnhypnosis/ to @marlinjai/ scope"
```

---

## Task 2: Accordion Block Renderer

**Goal:** Create a React visual renderer for the Accordion block type.

**Files:**
- Create: `packages/ui/src/renderer/blocks/AccordionBlock.tsx`
- Modify: `packages/ui/src/renderer/blocks/index.ts` (add export)
- Modify: `packages/ui/src/renderer/BlockRenderer.tsx` (register in BLOCK_COMPONENTS map)
- Test: `packages/ui/src/__tests__/renderer/AccordionBlock.test.tsx`

**Context:** The Accordion block has `items` (array of `{title, content}`), `iconPosition` ('left'|'right'), `borderColor`, and `fontFamily`. See `packages/core/src/store/mst/models/BlockModel.ts:132-133` for MST properties and `packages/blocks/src/accordion/index.ts` for the block definition.

**Step 1: Create the renderer component**

```tsx
// packages/ui/src/renderer/blocks/AccordionBlock.tsx
import React, { useState } from 'react';
import { observer } from 'mobx-react-lite';
import type { BlockInstance } from '@marlinjai/email-editor-core';

interface AccordionBlockProps {
  block: BlockInstance;
}

export const AccordionBlock = observer(({ block }: AccordionBlockProps) => {
  const [openIndex, setOpenIndex] = useState<number | null>(0);
  const iconRight = block.iconPosition !== 'left';

  if (block.items.length === 0) {
    return (
      <div className="accordion-block" style={{ padding: '12px', color: '#6b7280', fontSize: '14px' }}>
        No accordion items
      </div>
    );
  }

  return (
    <div
      className="accordion-block"
      style={{
        fontFamily: block.fontFamily || undefined,
        ...block.computedStyle,
      }}
    >
      {block.items.map((item, i) => {
        const isOpen = openIndex === i;
        return (
          <div
            key={i}
            style={{
              borderBottom: `1px solid ${block.borderColor || '#e0e0e0'}`,
            }}
          >
            <button
              onClick={() => setOpenIndex(isOpen ? null : i)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexDirection: iconRight ? 'row' : 'row-reverse',
                width: '100%',
                padding: '12px 8px',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: '14px',
                textAlign: 'left',
                color: 'inherit',
                fontFamily: 'inherit',
              }}
            >
              <span style={{ flex: 1 }}>{item.title}</span>
              <span style={{ fontSize: '12px', marginLeft: iconRight ? '8px' : 0, marginRight: iconRight ? 0 : '8px' }}>
                {isOpen ? '▲' : '▼'}
              </span>
            </button>
            {isOpen && (
              <div style={{ padding: '8px 8px 12px', fontSize: '14px', color: '#4b5563' }}>
                {item.content}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
});

AccordionBlock.displayName = 'AccordionBlock';
```

**Step 2: Export from blocks index**

Add to `packages/ui/src/renderer/blocks/index.ts`:
```typescript
export { AccordionBlock } from './AccordionBlock';
```

**Step 3: Register in BlockRenderer**

In `packages/ui/src/renderer/BlockRenderer.tsx`:
- Add import: `import { AccordionBlock } from './blocks/AccordionBlock';`
- Uncomment/add to BLOCK_COMPONENTS map: `[BlockType.ACCORDION]: AccordionBlock,`

**Step 4: Build and verify**

```bash
pnpm run build
```

Expected: Build succeeds. Open example app, drag Accordion block into canvas, see interactive accordion with expand/collapse.

**Step 5: Commit**

```bash
git add packages/ui/src/renderer/blocks/AccordionBlock.tsx packages/ui/src/renderer/blocks/index.ts packages/ui/src/renderer/BlockRenderer.tsx
git commit -m "feat: add Accordion block renderer"
```

---

## Task 3: Navbar Block Renderer

**Goal:** Create a React visual renderer for the Navbar block type.

**Files:**
- Create: `packages/ui/src/renderer/blocks/NavbarBlock.tsx`
- Modify: `packages/ui/src/renderer/blocks/index.ts` (add export)
- Modify: `packages/ui/src/renderer/BlockRenderer.tsx` (register in BLOCK_COMPONENTS map)

**Context:** The Navbar block uses `navLinks` (array of `{href, label, color}`) from BlockModel (line 139), `hamburger` (boolean, line 140), `align`, and `icoColor`. Note: the block definition at `blocks/src/navbar/index.ts` uses `links` in defaultProps, but the MST model property is `navLinks`.

**Step 1: Create the renderer component**

```tsx
// packages/ui/src/renderer/blocks/NavbarBlock.tsx
import React from 'react';
import { observer } from 'mobx-react-lite';
import type { BlockInstance } from '@marlinjai/email-editor-core';

interface NavbarBlockProps {
  block: BlockInstance;
}

export const NavbarBlock = observer(({ block }: NavbarBlockProps) => {
  if (block.navLinks.length === 0) {
    return (
      <div className="navbar-block" style={{ padding: '12px', color: '#6b7280', fontSize: '14px' }}>
        No navigation links
      </div>
    );
  }

  return (
    <nav
      className="navbar-block"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: block.align === 'left' ? 'flex-start' : block.align === 'right' ? 'flex-end' : 'center',
        gap: '16px',
        padding: '12px 16px',
        ...block.computedStyle,
      }}
    >
      {block.hamburger && (
        <span style={{ fontSize: '18px', color: block.icoColor || '#333', cursor: 'pointer' }}>
          ☰
        </span>
      )}
      {block.navLinks.map((link, i) => (
        <span
          key={i}
          style={{
            color: link.color || block.color || '#333',
            fontSize: '14px',
            fontWeight: 500,
            cursor: 'pointer',
            textDecoration: 'none',
          }}
        >
          {link.label}
        </span>
      ))}
    </nav>
  );
});

NavbarBlock.displayName = 'NavbarBlock';
```

**Step 2: Export + register** (same pattern as Task 2)

**Step 3: Commit**

```bash
git commit -m "feat: add Navbar block renderer"
```

---

## Task 4: Carousel Block Renderer

**Goal:** Create a React visual renderer for the Carousel block type.

**Files:**
- Create: `packages/ui/src/renderer/blocks/CarouselBlock.tsx`
- Modify: `packages/ui/src/renderer/blocks/index.ts` (add export)
- Modify: `packages/ui/src/renderer/BlockRenderer.tsx` (register in BLOCK_COMPONENTS map)

**Context:** The Carousel block uses `images` (array of `{src, alt, href, thumbnailSrc}`) from BlockModel (line 145), `thumbnails` ('visible'|'hidden'), `borderRadius`, `iconWidth`, `tbBorderRadius`.

**Step 1: Create the renderer component**

```tsx
// packages/ui/src/renderer/blocks/CarouselBlock.tsx
import React, { useState } from 'react';
import { observer } from 'mobx-react-lite';
import type { BlockInstance } from '@marlinjai/email-editor-core';

interface CarouselBlockProps {
  block: BlockInstance;
}

export const CarouselBlock = observer(({ block }: CarouselBlockProps) => {
  const [activeIndex, setActiveIndex] = useState(0);

  if (block.images.length === 0) {
    return (
      <div className="carousel-block" style={{ padding: '12px', color: '#6b7280', fontSize: '14px' }}>
        No carousel images
      </div>
    );
  }

  const activeImage = block.images[activeIndex];
  const showThumbnails = block.thumbnails !== 'hidden' && block.images.length > 1;

  return (
    <div className="carousel-block" style={block.computedStyle}>
      {/* Main image */}
      <div style={{ position: 'relative', textAlign: 'center' }}>
        {block.images.length > 1 && (
          <button
            onClick={() => setActiveIndex((activeIndex - 1 + block.images.length) % block.images.length)}
            style={{
              position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)',
              background: 'rgba(0,0,0,0.4)', color: '#fff', border: 'none',
              borderRadius: '50%', width: 32, height: 32, cursor: 'pointer', fontSize: '16px',
              zIndex: 1,
            }}
          >
            ‹
          </button>
        )}

        <img
          src={activeImage.src}
          alt={activeImage.alt || ''}
          style={{
            maxWidth: '100%',
            borderRadius: block.borderRadius || undefined,
            display: 'block',
            margin: '0 auto',
          }}
        />

        {block.images.length > 1 && (
          <button
            onClick={() => setActiveIndex((activeIndex + 1) % block.images.length)}
            style={{
              position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
              background: 'rgba(0,0,0,0.4)', color: '#fff', border: 'none',
              borderRadius: '50%', width: 32, height: 32, cursor: 'pointer', fontSize: '16px',
              zIndex: 1,
            }}
          >
            ›
          </button>
        )}
      </div>

      {/* Thumbnails */}
      {showThumbnails && (
        <div style={{ display: 'flex', gap: '4px', justifyContent: 'center', marginTop: '8px' }}>
          {block.images.map((img, i) => (
            <img
              key={i}
              src={img.thumbnailSrc || img.src}
              alt={img.alt || ''}
              onClick={() => setActiveIndex(i)}
              style={{
                width: block.iconWidth || '40px',
                height: block.iconWidth || '40px',
                objectFit: 'cover',
                borderRadius: block.tbBorderRadius || '4px',
                cursor: 'pointer',
                opacity: i === activeIndex ? 1 : 0.5,
                border: i === activeIndex ? '2px solid #333' : '2px solid transparent',
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
});

CarouselBlock.displayName = 'CarouselBlock';
```

**Step 2: Export + register** (same pattern as Task 2)

**Step 3: Commit**

```bash
git commit -m "feat: add Carousel block renderer"
```

---

## Task 5: Table Block Renderer

**Goal:** Create a React visual renderer for the Table block type.

**Files:**
- Create: `packages/ui/src/renderer/blocks/TableBlock.tsx`
- Modify: `packages/ui/src/renderer/blocks/index.ts` (add export)
- Modify: `packages/ui/src/renderer/BlockRenderer.tsx` (register in BLOCK_COMPONENTS map)

**Context:** The Table block uses `headers` (string[]), `rows` (string[][]), `align`, `color`, `fontSize`, `fontFamily`, `cellpadding`, `cellspacing`, `border`. See BlockModel lines 151-154.

**Step 1: Create the renderer component**

```tsx
// packages/ui/src/renderer/blocks/TableBlock.tsx
import React from 'react';
import { observer } from 'mobx-react-lite';
import type { BlockInstance } from '@marlinjai/email-editor-core';

interface TableBlockProps {
  block: BlockInstance;
}

export const TableBlock = observer(({ block }: TableBlockProps) => {
  if (block.headers.length === 0 && block.rows.length === 0) {
    return (
      <div className="table-block" style={{ padding: '12px', color: '#6b7280', fontSize: '14px' }}>
        Empty table
      </div>
    );
  }

  const cellPad = block.cellpadding || '8px';

  return (
    <div className="table-block" style={block.computedStyle}>
      <table
        style={{
          width: '100%',
          borderCollapse: block.cellspacing ? 'separate' : 'collapse',
          borderSpacing: block.cellspacing || undefined,
          border: block.border || undefined,
          color: block.color || '#000',
          fontSize: block.fontSize || '14px',
          fontFamily: block.fontFamily || undefined,
          textAlign: (block.align as React.CSSProperties['textAlign']) || 'left',
        }}
      >
        {block.headers.length > 0 && (
          <thead>
            <tr style={{ backgroundColor: '#f5f5f5' }}>
              {block.headers.map((h, i) => (
                <th
                  key={i}
                  style={{
                    padding: cellPad,
                    borderBottom: '1px solid #ddd',
                    textAlign: 'left',
                    fontWeight: 600,
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
        )}
        <tbody>
          {block.rows.map((row, ri) => (
            <tr key={ri}>
              {row.map((cell, ci) => (
                <td
                  key={ci}
                  style={{
                    padding: cellPad,
                    borderBottom: '1px solid #eee',
                  }}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
});

TableBlock.displayName = 'TableBlock';
```

**Step 2: Export + register** (same pattern as Task 2)

**Step 3: Commit**

```bash
git commit -m "feat: add Table block renderer"
```

---

## Task 6: Header Block Renderer (Branded, Locked)

**Goal:** Create a React visual renderer for the locked Header block.

**Files:**
- Create: `packages/ui/src/renderer/blocks/HeaderBlock.tsx`
- Modify: `packages/ui/src/renderer/blocks/index.ts` (add export)
- Modify: `packages/ui/src/renderer/BlockRenderer.tsx` (register in BLOCK_COMPONENTS map)

**Context:** The Header block is a locked/branded block. It renders a fixed newsletter header with a logo placeholder and title. It has `locked: true` and no editable properties. See `packages/blocks/src/branded/index.ts:12-36`.

**Step 1: Create the renderer component**

```tsx
// packages/ui/src/renderer/blocks/HeaderBlock.tsx
import React from 'react';
import { observer } from 'mobx-react-lite';
import type { BlockInstance } from '@marlinjai/email-editor-core';

interface HeaderBlockProps {
  block: BlockInstance;
}

export const HeaderBlock = observer(({ _block }: HeaderBlockProps) => {
  return (
    <div
      className="header-block"
      style={{
        backgroundColor: '#ffffff',
        padding: '20px',
        textAlign: 'center',
      }}
    >
      <div
        style={{
          width: '70px',
          height: '70px',
          backgroundColor: '#e5e7eb',
          borderRadius: '50%',
          margin: '0 auto 12px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#9ca3af',
          fontSize: '12px',
        }}
      >
        Logo
      </div>
      <div
        style={{
          fontSize: '24px',
          color: '#944923',
          fontFamily: 'Georgia, serif',
        }}
      >
        Welcome to the Newsletter
      </div>
    </div>
  );
});

HeaderBlock.displayName = 'HeaderBlock';
```

Note: The `_block` parameter is prefixed with underscore since the header renders fixed branded content and doesn't read block properties. The component still receives it for interface consistency.

**Step 2: Export + register** (same pattern as Task 2)

**Step 3: Commit**

```bash
git commit -m "feat: add Header block renderer (branded/locked)"
```

---

## Task 7: Footer Block Renderer (Branded, Locked)

**Goal:** Create a React visual renderer for the locked Footer block.

**Files:**
- Create: `packages/ui/src/renderer/blocks/FooterBlock.tsx`
- Modify: `packages/ui/src/renderer/blocks/index.ts` (add export)
- Modify: `packages/ui/src/renderer/BlockRenderer.tsx` (register in BLOCK_COMPONENTS map)

**Context:** The Footer block is locked/branded. Renders a fixed footer with copyright and unsubscribe link. See `packages/blocks/src/branded/index.ts:42-68`.

**Step 1: Create the renderer component**

```tsx
// packages/ui/src/renderer/blocks/FooterBlock.tsx
import React from 'react';
import { observer } from 'mobx-react-lite';
import type { BlockInstance } from '@marlinjai/email-editor-core';

interface FooterBlockProps {
  block: BlockInstance;
}

export const FooterBlock = observer(({ _block }: FooterBlockProps) => {
  return (
    <div
      className="footer-block"
      style={{
        backgroundColor: '#f5f5f5',
        padding: '20px',
        textAlign: 'center',
      }}
    >
      <div style={{ fontSize: '12px', color: '#666666', marginBottom: '8px' }}>
        &copy; {new Date().getFullYear()} All rights reserved.
      </div>
      <div style={{ fontSize: '12px' }}>
        <span style={{ color: '#944923', textDecoration: 'underline', cursor: 'pointer' }}>
          Unsubscribe
        </span>
      </div>
    </div>
  );
});

FooterBlock.displayName = 'FooterBlock';
```

**Step 2: Export + register** (same pattern as Task 2)

**Step 3: Build all packages and test in browser**

```bash
pnpm run build
cd examples/nextjs && pnpm run dev
```

Open `http://localhost:3000/editor`. Verify all 14 block types can be dragged from the sidebar onto the canvas and render correctly.

**Step 4: Commit**

```bash
git commit -m "feat: add Footer block renderer (branded/locked)"
```

---

## Task 8: Test Infrastructure Setup

**Goal:** Set up Vitest across all packages and establish test patterns.

**Files:**
- Create: `vitest.config.ts` (root workspace config)
- Create: `packages/core/vitest.config.ts`
- Create: `packages/blocks/vitest.config.ts`
- Modify: `packages/blocks/package.json` (add vitest devDep and test scripts)
- Modify: `packages/editor/package.json` (add vitest devDep and test scripts)

**Context:** Currently only `packages/core/package.json` has vitest (`^1.0.4`) and test scripts. No vitest.config.ts files exist anywhere. No test files exist. The root `package.json` has `"test": "turbo run test"` which delegates via Turbo.

**Step 1: Create root vitest workspace config**

```typescript
// vitest.config.ts (root)
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
  },
});
```

**Step 2: Create core vitest config**

```typescript
// packages/core/vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
```

**Step 3: Create blocks vitest config**

```typescript
// packages/blocks/vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
```

**Step 4: Add vitest and test scripts to blocks and editor packages**

In `packages/blocks/package.json`, add to devDependencies:
```json
"vitest": "^1.0.4"
```
Add to scripts:
```json
"test": "vitest run",
"test:watch": "vitest"
```

In `packages/editor/package.json`, add same.

**Step 5: Verify test runner works**

```bash
pnpm install
pnpm run test
```

Expected: Runs across all packages, finds no test files, exits cleanly with 0 tests.

**Step 6: Commit**

```bash
git commit -m "chore: set up Vitest test infrastructure across all packages"
```

---

## Task 9: Core Package Tests — Schema Validation

**Goal:** Write tests for the Zod schema validation in the core package.

**Files:**
- Create: `packages/core/src/schema/__tests__/validation.test.ts`

**Context:** The core package has Zod schemas for all block types. Test that valid blocks pass validation and invalid blocks are rejected. Check `packages/core/src/schema/validation.ts` for all exported schemas.

**Step 1: Write schema validation tests**

```typescript
// packages/core/src/schema/__tests__/validation.test.ts
import { describe, it, expect } from 'vitest';
// Import the actual schema exports from the validation module
// The exact imports depend on what's exported — read validation.ts first

describe('Block Schema Validation', () => {
  describe('TextBlock', () => {
    it('accepts valid text block', () => {
      // Validate a minimal valid text block snapshot
    });

    it('rejects text block missing required fields', () => {
      // Validate a block missing id or type
    });
  });

  describe('ImageBlock', () => {
    it('accepts valid image block with src', () => {
      // ...
    });

    it('accepts image block without optional src', () => {
      // ...
    });
  });

  // One describe per block type that has a schema
});
```

**Important:** Read `packages/core/src/schema/validation.ts` before writing tests to understand exact schema shapes and exports. The tests above are structural guidance — the implementing agent must read the actual schemas and write tests against the real validation logic.

**Step 2: Run tests**

```bash
cd packages/core && pnpm run test
```

Expected: All tests pass.

**Step 3: Commit**

```bash
git commit -m "test: add schema validation tests for all block types"
```

---

## Task 10: Core Package Tests — Block Registry

**Goal:** Write tests for the BlockRegistry.

**Files:**
- Create: `packages/core/src/registry/__tests__/BlockRegistry.test.ts`

**Context:** The BlockRegistryImpl class (`packages/core/src/registry/BlockRegistry.ts`) has methods: `register()`, `get()`, `getAll()`, `getByCategory()`, `has()`.

**Step 1: Write registry tests**

```typescript
// packages/core/src/registry/__tests__/BlockRegistry.test.ts
import { describe, it, expect } from 'vitest';
import { createBlockRegistry } from '../BlockRegistry';

describe('BlockRegistry', () => {
  it('registers and retrieves a block definition', () => {
    const registry = createBlockRegistry();
    const def = { type: 'test', label: 'Test', category: 'text', description: 'test', defaultProps: {}, propSchema: {} as any, toMJML: () => '' };
    registry.register(def);
    expect(registry.get('test')).toBe(def);
  });

  it('returns undefined for unregistered type', () => {
    const registry = createBlockRegistry();
    expect(registry.get('nonexistent')).toBeUndefined();
  });

  it('has() returns correct boolean', () => {
    const registry = createBlockRegistry();
    const def = { type: 'test', label: 'Test', category: 'text', description: 'test', defaultProps: {}, propSchema: {} as any, toMJML: () => '' };
    registry.register(def);
    expect(registry.has('test')).toBe(true);
    expect(registry.has('other')).toBe(false);
  });

  it('getAll returns all registered definitions', () => {
    const registry = createBlockRegistry();
    const def1 = { type: 'a', label: 'A', category: 'text', description: '', defaultProps: {}, propSchema: {} as any, toMJML: () => '' };
    const def2 = { type: 'b', label: 'B', category: 'media', description: '', defaultProps: {}, propSchema: {} as any, toMJML: () => '' };
    registry.register(def1);
    registry.register(def2);
    expect(registry.getAll()).toHaveLength(2);
  });

  it('getByCategory filters correctly', () => {
    const registry = createBlockRegistry();
    const textDef = { type: 'a', label: 'A', category: 'text', description: '', defaultProps: {}, propSchema: {} as any, toMJML: () => '' };
    const mediaDef = { type: 'b', label: 'B', category: 'media', description: '', defaultProps: {}, propSchema: {} as any, toMJML: () => '' };
    registry.register(textDef);
    registry.register(mediaDef);
    expect(registry.getByCategory('text')).toHaveLength(1);
    expect(registry.getByCategory('text')[0].type).toBe('a');
  });
});
```

**Step 2: Run tests, commit**

```bash
git commit -m "test: add BlockRegistry unit tests"
```

---

## Task 11: Core Package Tests — MST Store

**Goal:** Write tests for the MobX State Tree store (RootStore, template operations, undo/redo).

**Files:**
- Create: `packages/core/src/store/__tests__/RootStore.test.ts`

**Context:** The RootStore (`packages/core/src/store/mst/RootStore.ts`) has `createRootStore()` and `createEmptyStore()` factory functions. It composes TemplateModel and EditorUIStore. Test creating stores, adding/removing sections, and basic operations.

**Step 1: Write store tests**

Test cases to cover:
- `createEmptyStore()` creates a store with default template
- `createRootStore()` accepts a template snapshot
- Adding and removing sections
- Adding and removing blocks from columns
- Block property updates via `updateStyle()` and `updateProperties()`
- EditorUI selection and hover state
- Block `displayName` computed view for each type

**Step 2: Run tests, commit**

```bash
git commit -m "test: add MobX State Tree store unit tests"
```

---

## Task 12: Core Package Tests — MJML Compiler

**Goal:** Write tests for the MJML compiler.

**Files:**
- Create: `packages/core/src/compiler/__tests__/MJMLCompiler.test.ts`

**Context:** The compiler (`packages/core/src/compiler/MJMLCompiler.ts`) is server-side only (imported from `@marlinjai/email-editor-core/server`). It takes a template snapshot and produces MJML markup, then compiles to HTML. Test the MJML generation for each block type.

**Important:** MJML compilation requires the `mjml` npm package which is a server dependency. Tests need to import from the server entry point.

**Step 1: Write compiler tests**

Test cases to cover:
- Compiles a minimal template with one text block
- Compiles each block type to expected MJML tags
- Handles hidden blocks (should produce empty string)
- Handles empty template
- Generates valid HTML output from `compile()`

**Step 2: Run tests, commit**

```bash
git commit -m "test: add MJML compiler unit tests"
```

---

## Task 13: Blocks Package Tests — Standard Registry

**Goal:** Test that the standard block registry contains all 14 block types with correct definitions.

**Files:**
- Create: `packages/blocks/src/__tests__/registry.test.ts`

**Context:** `createStandardBlockRegistry()` from `packages/blocks/src/registry.ts` registers all 14 block types.

**Step 1: Write registry integration tests**

```typescript
// packages/blocks/src/__tests__/registry.test.ts
import { describe, it, expect } from 'vitest';
import { createStandardBlockRegistry } from '../registry';

describe('Standard Block Registry', () => {
  it('registers all 14 block types', () => {
    const registry = createStandardBlockRegistry();
    const all = registry.getAll();
    expect(all).toHaveLength(14);
  });

  it('includes all expected block types', () => {
    const registry = createStandardBlockRegistry();
    const types = ['text', 'image', 'button', 'divider', 'spacer', 'social', 'hero', 'accordion', 'raw', 'navbar', 'carousel', 'table', 'header', 'footer'];
    for (const type of types) {
      expect(registry.has(type)).toBe(true);
    }
  });

  it('each definition has required fields', () => {
    const registry = createStandardBlockRegistry();
    for (const def of registry.getAll()) {
      expect(def.type).toBeTruthy();
      expect(def.label).toBeTruthy();
      expect(def.category).toBeTruthy();
      expect(def.toMJML).toBeTypeOf('function');
    }
  });

  it('header and footer are locked', () => {
    const registry = createStandardBlockRegistry();
    expect(registry.get('header')?.locked).toBe(true);
    expect(registry.get('footer')?.locked).toBe(true);
  });
});
```

**Step 2: Run all tests from root**

```bash
pnpm run test
```

Expected: All tests pass across core and blocks packages.

**Step 3: Commit**

```bash
git commit -m "test: add standard block registry integration tests"
```

---

## Task 14: Update Documentation and Final Verification

**Goal:** Update CHANGELOG, ROADMAP, and rebuild docs.

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `docs/internal/ROADMAP.md`

**Step 1: Update CHANGELOG**

Add to `[Unreleased]` section:
```markdown
### Changed
- All packages renamed from `@returnhypnosis/` to `@marlinjai/` scope

### Added
- Accordion block renderer (interactive expand/collapse preview)
- Navbar block renderer (navigation link preview with hamburger icon)
- Carousel block renderer (image slideshow with thumbnails and navigation)
- Table block renderer (data table with headers and rows)
- Header block renderer (branded/locked newsletter header)
- Footer block renderer (branded/locked newsletter footer)
- Vitest test infrastructure across core and blocks packages
- Unit tests for schema validation, block registry, MST store, MJML compiler
- Integration tests for standard block registry (all 14 types)
```

**Step 2: Update ROADMAP**

Check off completed Phase 0 items:
```markdown
- [x] Rename packages from `@returnhypnosis/` to `@marlinjai/`
- [x] Complete remaining 6 block type renderers (Accordion, Navbar, Carousel, Table, Header, Footer)
- [x] Add test coverage (Vitest configured but no tests yet)
```

**Step 3: Full build and test verification**

```bash
pnpm run build && pnpm run test
```

Expected: All packages build, all tests pass.

**Step 4: Commit and push**

```bash
git add -A
git commit -m "docs: update changelog and roadmap for Phase 0 completion"
git push origin main
```

---

## Execution Order & Dependencies

```
Task 1 (rename) ─────────────┐
                              ├─→ Tasks 2-7 (renderers, can run in parallel)
                              │         │
                              │         ├─→ Task 8 (test infra)
                              │         │         │
                              │         │         ├─→ Tasks 9-13 (tests, can run in parallel)
                              │         │         │         │
                              │         │         │         └─→ Task 14 (docs + final)
```

- **Task 1** must complete first (all other tasks import from `@marlinjai/`)
- **Tasks 2-7** can run in parallel after Task 1
- **Task 8** depends on Task 1 (imports the renamed packages)
- **Tasks 9-13** can run in parallel after Task 8
- **Task 14** depends on everything else
