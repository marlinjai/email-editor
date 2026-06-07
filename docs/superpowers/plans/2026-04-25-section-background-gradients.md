# Section Background Gradients Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add CSS gradient support to section and column backgrounds in the email editor, rendering correctly in ~87% of email clients with a solid-color fallback for Outlook.

**Architecture:** A shared `buildGradientCSS` utility converts a structured `BackgroundGradient` object into a CSS `linear-gradient()` / `radial-gradient()` value. The compiler collects gradient rules from all sections and columns before building the MJML head, injecting them as a single `<mj-style>` block and adding a `css-class` reference on each element. The canvas preview applies the gradient via React inline styles using the same utility.

**Tech Stack:** TypeScript, Zod, MobX State Tree (`types.frozen`), MJML (`mj-style` + `css-class`), React

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `packages/core/src/schema/gradient.ts` | `BackgroundGradient` type + `buildGradientCSS()` utility |
| Modify | `packages/core/src/schema/types.ts` | Add `BackgroundGradient` to `Section` and `Column` |
| Modify | `packages/core/src/schema/validation.ts` | Add Zod schemas; extend `SectionSchema` and `ColumnSchema` |
| Modify | `packages/core/src/store/mst/models/SectionModel.ts` | Add frozen `backgroundGradient` field; update `computedStyle`, `updateProperties` |
| Modify | `packages/core/src/store/mst/models/ColumnModel.ts` | Same as SectionModel |
| Modify | `packages/core/src/compiler/MJMLCompiler.ts` | Collect gradient CSS; inject `<mj-style>`; add `css-class` to sections/columns |
| Modify | `packages/ui/src/renderer/SectionRenderer.tsx` | Apply gradient to canvas preview via inline style |
| Modify | `packages/ui/src/inspector/fields/index.tsx` | Add `GradientField` component |
| Modify | `packages/ui/src/inspector/properties/SectionProperties.tsx` | Add gradient controls |
| Modify | `packages/ui/src/inspector/properties/ColumnProperties.tsx` | Add gradient controls |

---

## Task 1: Gradient Type and CSS Utility

**Files:**
- Create: `packages/core/src/schema/gradient.ts`

- [ ] **Step 1: Create the file with the type and utility**

```typescript
// packages/core/src/schema/gradient.ts

export interface GradientStop {
  color: string;     // CSS color string, e.g. "#ff0000" or "rgba(255,0,0,0.5)"
  position: number;  // 0-100 percentage
}

export interface BackgroundGradient {
  type: 'linear' | 'radial';
  angle: number;     // degrees — only used when type === 'linear', ignored for radial
  stops: GradientStop[];
}

/**
 * Converts a BackgroundGradient to a CSS background-image value.
 * Returns undefined when stops array is empty.
 *
 * Examples:
 *   buildGradientCSS({ type: 'linear', angle: 90, stops: [{color:'#f00',position:0},{color:'#00f',position:100}] })
 *   // => "linear-gradient(90deg, #f00 0%, #00f 100%)"
 *
 *   buildGradientCSS({ type: 'radial', angle: 0, stops: [{color:'#f00',position:0},{color:'#00f',position:100}] })
 *   // => "radial-gradient(circle, #f00 0%, #00f 100%)"
 */
export function buildGradientCSS(gradient: BackgroundGradient): string | undefined {
  if (gradient.stops.length === 0) return undefined;

  const stopList = gradient.stops
    .map((s) => `${s.color} ${s.position}%`)
    .join(', ');

  if (gradient.type === 'radial') {
    return `radial-gradient(circle, ${stopList})`;
  }
  return `linear-gradient(${gradient.angle}deg, ${stopList})`;
}
```

- [ ] **Step 2: Write failing tests**

Create `packages/core/src/schema/__tests__/gradient.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { buildGradientCSS } from '../gradient';
import type { BackgroundGradient } from '../gradient';

describe('buildGradientCSS', () => {
  it('returns undefined for empty stops', () => {
    const g: BackgroundGradient = { type: 'linear', angle: 90, stops: [] };
    expect(buildGradientCSS(g)).toBeUndefined();
  });

  it('builds a linear gradient', () => {
    const g: BackgroundGradient = {
      type: 'linear',
      angle: 90,
      stops: [
        { color: '#ff0000', position: 0 },
        { color: '#0000ff', position: 100 },
      ],
    };
    expect(buildGradientCSS(g)).toBe('linear-gradient(90deg, #ff0000 0%, #0000ff 100%)');
  });

  it('builds a radial gradient (ignores angle)', () => {
    const g: BackgroundGradient = {
      type: 'radial',
      angle: 45,
      stops: [
        { color: '#ffffff', position: 0 },
        { color: '#000000', position: 100 },
      ],
    };
    expect(buildGradientCSS(g)).toBe('radial-gradient(circle, #ffffff 0%, #000000 100%)');
  });

  it('handles multiple stops', () => {
    const g: BackgroundGradient = {
      type: 'linear',
      angle: 180,
      stops: [
        { color: '#f00', position: 0 },
        { color: '#0f0', position: 50 },
        { color: '#00f', position: 100 },
      ],
    };
    expect(buildGradientCSS(g)).toBe('linear-gradient(180deg, #f00 0%, #0f0 50%, #00f 100%)');
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
pnpm -F @marlinjai/email-editor-core run test -- src/schema/__tests__/gradient.test.ts
```
Expected: FAIL with "Cannot find module '../gradient'"

- [ ] **Step 4: Run tests again to verify they pass**

```bash
pnpm -F @marlinjai/email-editor-core run test -- src/schema/__tests__/gradient.test.ts
```
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/schema/gradient.ts packages/core/src/schema/__tests__/gradient.test.ts
git commit -m "feat(core): add BackgroundGradient type and buildGradientCSS utility"
```

---

## Task 2: Schema Types

**Files:**
- Modify: `packages/core/src/schema/types.ts`

- [ ] **Step 1: Write the failing test first**

Add to `packages/core/src/schema/__tests__/validation.test.ts` (or create it if absent):

```typescript
import { describe, it, expect } from 'vitest';
import { SectionSchema, ColumnSchema } from '../validation';

describe('SectionSchema gradient', () => {
  it('accepts a section with a linear backgroundGradient', () => {
    const result = SectionSchema.safeParse({
      id: 's1',
      type: 'section',
      backgroundGradient: {
        type: 'linear',
        angle: 90,
        stops: [
          { color: '#ff0000', position: 0 },
          { color: '#0000ff', position: 100 },
        ],
      },
      columns: [{ id: 'c1', blocks: [] }],
    });
    expect(result.success).toBe(true);
  });

  it('rejects a gradient stop with missing color', () => {
    const result = SectionSchema.safeParse({
      id: 's1',
      type: 'section',
      backgroundGradient: {
        type: 'linear',
        angle: 90,
        stops: [{ position: 0 }],
      },
      columns: [{ id: 'c1', blocks: [] }],
    });
    expect(result.success).toBe(false);
  });

  it('accepts a column with a radial backgroundGradient', () => {
    const result = ColumnSchema.safeParse({
      id: 'c1',
      backgroundGradient: {
        type: 'radial',
        angle: 0,
        stops: [
          { color: '#fff', position: 0 },
          { color: '#000', position: 100 },
        ],
      },
      blocks: [],
    });
    expect(result.success).toBe(true);
  });
});
```

Run to confirm failure:
```bash
pnpm -F @marlinjai/email-editor-core run test -- src/schema/__tests__/validation.test.ts
```
Expected: FAIL — `SectionSchema` has no `backgroundGradient` field.

- [ ] **Step 2: Add `BackgroundGradient` import and field to `types.ts`**

At the top of `packages/core/src/schema/types.ts`, add the import:
```typescript
import type { BackgroundGradient } from './gradient';
```

Re-export it so consumers can import from one place:
```typescript
export type { BackgroundGradient, GradientStop } from './gradient';
```

In the `Section` interface, add after `backgroundSize`:
```typescript
backgroundGradient?: BackgroundGradient;
```

In the `Column` interface, add after `backgroundColor`:
```typescript
backgroundGradient?: BackgroundGradient;
```

- [ ] **Step 3: Extend `validation.ts`**

In `packages/core/src/schema/validation.ts`, add at the top of the file after the `z` import:
```typescript
import type { BackgroundGradient } from './gradient';
```

Add Zod schemas after `SpacingSchema`:
```typescript
export const GradientStopSchema = z.object({
  color: z.string().min(1),
  position: z.number().min(0).max(100),
});

export const BackgroundGradientSchema = z.object({
  type: z.enum(['linear', 'radial']),
  angle: z.number().min(0).max(360),
  stops: z.array(GradientStopSchema).min(1),
}) satisfies z.ZodType<BackgroundGradient>;
```

In `SectionSchema`, add after `backgroundSize`:
```typescript
backgroundGradient: BackgroundGradientSchema.optional(),
```

In `ColumnSchema`, add after `backgroundColor`:
```typescript
backgroundGradient: BackgroundGradientSchema.optional(),
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
pnpm -F @marlinjai/email-editor-core run test -- src/schema/__tests__/validation.test.ts
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/schema/types.ts packages/core/src/schema/validation.ts packages/core/src/schema/__tests__/validation.test.ts
git commit -m "feat(core): add backgroundGradient field to Section and Column schema"
```

---

## Task 3: MST SectionModel

**Files:**
- Modify: `packages/core/src/store/mst/models/SectionModel.ts`

- [ ] **Step 1: Add `backgroundGradient` to the model**

In `packages/core/src/store/mst/models/SectionModel.ts`, add the import at the top:
```typescript
import type { BackgroundGradient } from '../../schema/gradient';
import { buildGradientCSS } from '../../schema/gradient';
```

In the `types.model('Section', { ... })` block, after `backgroundSize`:
```typescript
backgroundGradient: types.maybe(types.frozen<BackgroundGradient>()),
```

- [ ] **Step 2: Update `updateProperties` action**

In the `updateProperties` action, extend the parameter type to include `backgroundGradient`:
```typescript
updateProperties(updates: {
  backgroundColor?: string;
  backgroundImage?: string;
  backgroundPosition?: string;
  backgroundRepeat?: 'repeat' | 'no-repeat';
  backgroundSize?: string;
  backgroundGradient?: BackgroundGradient;
  fullWidth?: boolean;
  isWrapper?: boolean;
  noStack?: boolean;
  paddingTop?: string;
  paddingRight?: string;
  paddingBottom?: string;
  paddingLeft?: string;
}) {
  Object.entries(updates).forEach(([key, value]) => {
    if (key in self) {
      (self as any)[key] = value;
    }
  });
},
```

- [ ] **Step 3: Update `computedStyle` view**

Replace the `computedStyle` getter in the `.views(self => ({ ... }))` block:
```typescript
get computedStyle(): CSSProperties {
  const style: CSSProperties = {};

  if (self.backgroundGradient) {
    const css = buildGradientCSS(self.backgroundGradient);
    if (css) style.backgroundImage = css;
  } else if (self.backgroundImage) {
    style.backgroundImage = `url(${self.backgroundImage})`;
    if (self.backgroundPosition) style.backgroundPosition = self.backgroundPosition;
    if (self.backgroundRepeat) style.backgroundRepeat = self.backgroundRepeat;
    if (self.backgroundSize) style.backgroundSize = self.backgroundSize;
  }

  if (self.backgroundColor) style.backgroundColor = self.backgroundColor;
  if (self.paddingTop) style.paddingTop = self.paddingTop;
  if (self.paddingRight) style.paddingRight = self.paddingRight;
  if (self.paddingBottom) style.paddingBottom = self.paddingBottom;
  if (self.paddingLeft) style.paddingLeft = self.paddingLeft;

  return style;
},
```

- [ ] **Step 4: Type-check**

```bash
pnpm -F @marlinjai/email-editor-core run lint
```
Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/store/mst/models/SectionModel.ts
git commit -m "feat(core): add backgroundGradient to SectionModel"
```

---

## Task 4: MST ColumnModel

**Files:**
- Modify: `packages/core/src/store/mst/models/ColumnModel.ts`

- [ ] **Step 1: Add `backgroundGradient` field and imports**

In `packages/core/src/store/mst/models/ColumnModel.ts`, add at the top:
```typescript
import type { BackgroundGradient } from '../../schema/gradient';
import { buildGradientCSS } from '../../schema/gradient';
```

In the `types.model('Column', { ... })` block, after `backgroundColor`:
```typescript
backgroundGradient: types.maybe(types.frozen<BackgroundGradient>()),
```

- [ ] **Step 2: Extend `updateProperties` parameter type**

Find the `updateProperties` action signature and add `backgroundGradient?: BackgroundGradient` to the parameter object type.

- [ ] **Step 3: Update `computedStyle` view in ColumnModel**

Find the `computedStyle` getter. Replace the backgroundColor and backgroundImage block with:
```typescript
get computedStyle(): CSSProperties {
  const style: CSSProperties = {};

  if (self.backgroundGradient) {
    const css = buildGradientCSS(self.backgroundGradient);
    if (css) style.backgroundImage = css;
  }

  if (self.backgroundColor) style.backgroundColor = self.backgroundColor;
  if (self.paddingTop) style.paddingTop = self.paddingTop;
  if (self.paddingRight) style.paddingRight = self.paddingRight;
  if (self.paddingBottom) style.paddingBottom = self.paddingBottom;
  if (self.paddingLeft) style.paddingLeft = self.paddingLeft;
  if (self.verticalAlign) style.verticalAlign = self.verticalAlign;

  return style;
},
```

- [ ] **Step 4: Type-check**

```bash
pnpm -F @marlinjai/email-editor-core run lint
```
Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/store/mst/models/ColumnModel.ts
git commit -m "feat(core): add backgroundGradient to ColumnModel"
```

---

## Task 5: MJML Compiler

**Files:**
- Modify: `packages/core/src/compiler/MJMLCompiler.ts`

- [ ] **Step 1: Write failing compiler tests**

In `packages/core/src/compiler/__tests__/MJMLCompiler.test.ts`, add at the end of the file:

```typescript
describe('gradient support', () => {
  it('injects a linear gradient as mj-style and css-class on section', () => {
    const template: EmailTemplate = {
      version: '1.0',
      metadata: {},
      sections: [
        {
          id: 'sec-grad',
          type: 'section',
          backgroundGradient: {
            type: 'linear',
            angle: 135,
            stops: [
              { color: '#ff0000', position: 0 },
              { color: '#0000ff', position: 100 },
            ],
          },
          columns: [{ id: 'col-1', blocks: [] }],
        },
      ],
    };
    const compiler = new MJMLCompiler();
    const result = compiler.compile(template);
    expect(result.mjml).toContain('linear-gradient(135deg, #ff0000 0%, #0000ff 100%)');
    expect(result.mjml).toContain('el-grad-sec-grad');
    expect(result.mjml).toContain('<mj-style>');
  });

  it('uses first stop color as background-color fallback for Outlook', () => {
    const template: EmailTemplate = {
      version: '1.0',
      metadata: {},
      sections: [
        {
          id: 'sec-grad',
          type: 'section',
          backgroundGradient: {
            type: 'linear',
            angle: 90,
            stops: [
              { color: '#abcdef', position: 0 },
              { color: '#fedcba', position: 100 },
            ],
          },
          columns: [{ id: 'col-1', blocks: [] }],
        },
      ],
    };
    const compiler = new MJMLCompiler();
    const result = compiler.compile(template);
    expect(result.mjml).toContain('background-color="#abcdef"');
  });

  it('does not inject mj-style when no gradients exist', () => {
    const template: EmailTemplate = {
      version: '1.0',
      metadata: {},
      sections: [
        {
          id: 'sec-1',
          type: 'section',
          backgroundColor: '#ffffff',
          columns: [{ id: 'col-1', blocks: [] }],
        },
      ],
    };
    const compiler = new MJMLCompiler();
    const result = compiler.compile(template);
    // Should not have el-grad- css class
    expect(result.mjml).not.toContain('el-grad-');
  });
});
```

Run to confirm failure:
```bash
pnpm -F @marlinjai/email-editor-core run test -- src/compiler/__tests__/MJMLCompiler.test.ts
```
Expected: FAIL

- [ ] **Step 2: Add import and helper to MJMLCompiler**

At the top of `packages/core/src/compiler/MJMLCompiler.ts`, add:
```typescript
import { buildGradientCSS } from '../schema/gradient';
import type { BackgroundGradient } from '../schema/gradient';
```

- [ ] **Step 3: Add `collectGradientStyles` private method**

Add this private method to the `MJMLCompiler` class (after `generateHead`):

```typescript
private collectGradientStyles(sections: Section[]): string {
  const rules: string[] = [];
  for (const section of sections) {
    if (section.backgroundGradient) {
      const css = buildGradientCSS(section.backgroundGradient);
      if (css) {
        rules.push(`.el-grad-${section.id} { background-image: ${css}; }`);
      }
    }
    for (const column of section.columns) {
      if (column.backgroundGradient) {
        const css = buildGradientCSS(column.backgroundGradient);
        if (css) {
          rules.push(`.el-grad-${column.id} { background-image: ${css}; }`);
        }
      }
    }
  }
  return rules.join('\n');
}
```

- [ ] **Step 4: Update `templateToMJML` to collect and inject gradient CSS**

Replace the `templateToMJML` private method body:
```typescript
private templateToMJML(template: EmailTemplate): string {
  const { metadata, sections } = template;

  const gradientCSS = this.collectGradientStyles(sections);
  const head = this.generateHead(metadata, gradientCSS);
  const body = sections.map((section) => this.sectionToMJML(section)).join('\n');

  return `
<mjml>
  ${head}
  <mj-body>
    ${body}
  </mj-body>
</mjml>
  `.trim();
}
```

- [ ] **Step 5: Update `generateHead` signature and body**

Change the method signature to:
```typescript
private generateHead(metadata: EmailTemplate['metadata'], gradientCSS?: string): string {
```

Before the closing `parts.push('</mj-head>')`, add:
```typescript
if (gradientCSS) {
  parts.push(`<mj-style>${gradientCSS}</mj-style>`);
}
```

- [ ] **Step 6: Update `sectionToMJML` to apply gradient css-class and background-color fallback**

In `sectionToMJML`, find where `css-class` is assembled. The existing code sets it as part of template strings at lines ~185 and ~196. Refactor to build the class list dynamically:

Replace the `sectionToMJML` private method. The key changes are:
1. Build `cssClasses` array
2. When gradient present, push first-stop color as `background-color` and add `el-grad-{id}` to classes
3. Join classes into `css-class` attribute

```typescript
private sectionToMJML(section: Section): string {
  if (section.hidden) return '';

  const attrs: string[] = [];
  const cssClasses: string[] = ['el-section', `el-${section.id}`];

  if (section.backgroundGradient) {
    // First stop is the Outlook fallback solid color
    const fallback = section.backgroundGradient.stops[0]?.color;
    if (fallback) attrs.push(`background-color="${fallback}"`);
    cssClasses.push(`el-grad-${section.id}`);
  } else {
    if (section.backgroundColor) {
      attrs.push(`background-color="${section.backgroundColor}"`);
    }
    if (section.backgroundImage) {
      attrs.push(`background-url="${section.backgroundImage}"`);
    }
    if (section.backgroundPosition) {
      attrs.push(`background-position="${section.backgroundPosition}"`);
    }
    if (section.backgroundRepeat) {
      attrs.push(`background-repeat="${section.backgroundRepeat}"`);
    }
    if (section.backgroundSize) {
      attrs.push(`background-size="${section.backgroundSize}"`);
    }
  }

  if (section.fullWidth) {
    attrs.push('full-width="full-width"');
  }
  if (section.padding) {
    const padding = spacingToString(section.padding);
    if (padding) attrs.push(`padding="${padding}"`);
  }

  attrs.push(`css-class="${cssClasses.join(' ')}"`);

  const columns = section.columns.map((col) => this.columnToMJML(col)).join('\n');

  if (section.isWrapper) {
    return `
<mj-wrapper ${attrs.join(' ')}>
  <mj-section>
    ${columns}
  </mj-section>
</mj-wrapper>
    `.trim();
  }

  if (section.noStack && section.columns.length > 1) {
    return `
<mj-section ${attrs.join(' ')}>
  <mj-group>
    ${columns}
  </mj-group>
</mj-section>
    `.trim();
  }

  return `
<mj-section ${attrs.join(' ')}>
  ${columns}
</mj-section>
  `.trim();
}
```

- [ ] **Step 7: Update `columnToMJML` with gradient support**

Find `columnToMJML` and apply the same pattern: when `column.backgroundGradient` is present, push first-stop color as `background-color` and add `el-grad-{column.id}` to its `css-class`. When absent, use the existing `column.backgroundColor` path.

- [ ] **Step 8: Run compiler tests**

```bash
pnpm -F @marlinjai/email-editor-core run test -- src/compiler/__tests__/MJMLCompiler.test.ts
```
Expected: PASS (all existing + 3 new gradient tests)

- [ ] **Step 9: Run full test suite**

```bash
pnpm -F @marlinjai/email-editor-core run test
```
Expected: PASS

- [ ] **Step 10: Commit**

```bash
git add packages/core/src/compiler/MJMLCompiler.ts packages/core/src/compiler/__tests__/MJMLCompiler.test.ts
git commit -m "feat(core): compile backgroundGradient to mj-style CSS injection with Outlook fallback"
```

---

## Task 6: Canvas Preview (SectionRenderer)

**Files:**
- Modify: `packages/ui/src/renderer/SectionRenderer.tsx`

- [ ] **Step 1: Add the import**

At the top of `packages/ui/src/renderer/SectionRenderer.tsx`, add:
```typescript
import { buildGradientCSS } from '@marlinjai/email-editor-core';
```

(Verify that `buildGradientCSS` is exported from the core package's barrel `index.ts`. If not, add `export { buildGradientCSS } from './schema/gradient';` to `packages/core/src/index.ts`.)

- [ ] **Step 2: Update `sectionStyle` to apply gradient**

Replace the `sectionStyle` object construction:
```typescript
const gradientCSS = section.backgroundGradient
  ? buildGradientCSS(section.backgroundGradient)
  : undefined;

const sectionStyle: React.CSSProperties = {
  backgroundColor: section.backgroundColor || undefined,
  backgroundImage: gradientCSS
    ? gradientCSS
    : section.backgroundImage
    ? `url(${section.backgroundImage})`
    : undefined,
  backgroundPosition: gradientCSS ? undefined : section.backgroundPosition || 'center',
  backgroundRepeat: gradientCSS ? undefined : section.backgroundRepeat || 'no-repeat',
  backgroundSize: gradientCSS ? undefined : section.backgroundSize || 'cover',
  paddingTop: section.paddingTop || '20px',
  paddingRight: section.paddingRight || '20px',
  paddingBottom: section.paddingBottom || '20px',
  paddingLeft: section.paddingLeft || '20px',
  width: section.fullWidth ? '100%' : undefined,
};
```

- [ ] **Step 3: Type-check**

```bash
pnpm -F @marlinjai/email-editor-ui run lint
```
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add packages/ui/src/renderer/SectionRenderer.tsx
git commit -m "feat(ui): render backgroundGradient in canvas preview"
```

---

## Task 7: GradientField Component

**Files:**
- Modify: `packages/ui/src/inspector/fields/index.tsx`

- [ ] **Step 1: Add the import at the top of `fields/index.tsx`**

```typescript
import type { BackgroundGradient, GradientStop } from '@marlinjai/email-editor-core';
```

- [ ] **Step 2: Add `GradientField` at the end of `fields/index.tsx`**

```typescript
/**
 * Gradient editor field
 * Allows configuring a linear or radial background gradient with 2+ color stops.
 */
export function GradientField({
  value,
  onChange,
}: {
  value: BackgroundGradient | undefined;
  onChange: (gradient: BackgroundGradient | undefined) => void;
}) {
  const defaultGradient: BackgroundGradient = {
    type: 'linear',
    angle: 135,
    stops: [
      { color: '#667eea', position: 0 },
      { color: '#764ba2', position: 100 },
    ],
  };

  const gradient = value ?? defaultGradient;

  const updateStop = (index: number, patch: Partial<GradientStop>) => {
    const stops = gradient.stops.map((s, i) => (i === index ? { ...s, ...patch } : s));
    onChange({ ...gradient, stops });
  };

  const addStop = () => {
    const stops = [...gradient.stops, { color: '#ffffff', position: 50 }];
    onChange({ ...gradient, stops });
  };

  const removeStop = (index: number) => {
    if (gradient.stops.length <= 2) return; // minimum 2 stops
    const stops = gradient.stops.filter((_, i) => i !== index);
    onChange({ ...gradient, stops });
  };

  // Preview CSS for the swatch
  const previewCSS =
    gradient.type === 'radial'
      ? `radial-gradient(circle, ${gradient.stops.map((s) => `${s.color} ${s.position}%`).join(', ')})`
      : `linear-gradient(${gradient.angle}deg, ${gradient.stops.map((s) => `${s.color} ${s.position}%`).join(', ')})`;

  return (
    <div className="space-y-3">
      {/* Preview swatch */}
      <div
        className="w-full h-8 rounded border border-gray-300"
        style={{ backgroundImage: previewCSS }}
      />

      {/* Type toggle */}
      <div className="flex gap-1">
        {(['linear', 'radial'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => onChange({ ...gradient, type: t })}
            className={clsx(
              'flex-1 py-1 text-xs rounded border capitalize',
              gradient.type === t
                ? 'bg-blue-50 border-blue-500 text-blue-700'
                : 'border-gray-300 hover:bg-gray-50'
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Angle slider (linear only) */}
      {gradient.type === 'linear' && (
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Angle: {gradient.angle}°
          </label>
          <input
            type="range"
            min={0}
            max={360}
            value={gradient.angle}
            onChange={(e) => onChange({ ...gradient, angle: parseInt(e.target.value) })}
            className="w-full"
          />
        </div>
      )}

      {/* Color stops */}
      <div className="space-y-2">
        <label className="block text-xs font-medium text-gray-600">Color Stops</label>
        {gradient.stops.map((stop, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              type="color"
              value={stop.color}
              onChange={(e) => updateStop(i, { color: e.target.value })}
              className="w-7 h-7 rounded border border-gray-300 cursor-pointer flex-shrink-0"
            />
            <input
              type="number"
              min={0}
              max={100}
              value={stop.position}
              onChange={(e) => updateStop(i, { position: parseInt(e.target.value) || 0 })}
              className="w-16 px-1.5 py-1 text-xs border border-gray-300 rounded"
            />
            <span className="text-xs text-gray-400">%</span>
            <button
              type="button"
              onClick={() => removeStop(i)}
              disabled={gradient.stops.length <= 2}
              className="ml-auto text-xs text-gray-400 hover:text-red-500 disabled:opacity-30"
            >
              ✕
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={addStop}
          className="w-full py-1 text-xs border border-dashed border-gray-300 rounded hover:bg-gray-50 text-gray-500"
        >
          + Add Stop
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Type-check**

```bash
pnpm -F @marlinjai/email-editor-ui run lint
```
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add packages/ui/src/inspector/fields/index.tsx
git commit -m "feat(ui): add GradientField inspector component"
```

---

## Task 8: SectionProperties Inspector

**Files:**
- Modify: `packages/ui/src/inspector/properties/SectionProperties.tsx`

- [ ] **Step 1: Update imports**

In `packages/ui/src/inspector/properties/SectionProperties.tsx`, add `GradientField` to the import from `'../fields'`:
```typescript
import {
  TextField,
  ColorField,
  CheckboxField,
  SpacingField,
  ButtonGroupField,
  GradientField,
} from '../fields';
```

Also add:
```typescript
import type { BackgroundGradient } from '@marlinjai/email-editor-core';
```

- [ ] **Step 2: Add background mode toggle and gradient controls**

Replace the `Background Color` and `Background Image` fields in the JSX with:
```tsx
{/* Background mode */}
<div>
  <label className="block text-xs font-medium text-gray-600 mb-1">Background</label>
  <div className="flex gap-1 mb-2">
    {(['color', 'gradient', 'image'] as const).map((mode) => {
      const active =
        mode === 'gradient'
          ? !!section.backgroundGradient
          : mode === 'image'
          ? !!section.backgroundImage && !section.backgroundGradient
          : !section.backgroundGradient && !section.backgroundImage;
      return (
        <button
          key={mode}
          type="button"
          onClick={() => {
            if (mode === 'gradient') {
              section.updateProperties({
                backgroundGradient: {
                  type: 'linear',
                  angle: 135,
                  stops: [
                    { color: '#667eea', position: 0 },
                    { color: '#764ba2', position: 100 },
                  ],
                },
                backgroundImage: undefined,
              });
            } else if (mode === 'color') {
              section.updateProperties({ backgroundGradient: undefined, backgroundImage: undefined });
            } else {
              section.updateProperties({ backgroundGradient: undefined });
            }
          }}
          className={clsx(
            'flex-1 py-1 text-xs rounded border capitalize',
            active
              ? 'bg-blue-50 border-blue-500 text-blue-700'
              : 'border-gray-300 hover:bg-gray-50'
          )}
        >
          {mode}
        </button>
      );
    })}
  </div>

  {!section.backgroundGradient && !section.backgroundImage && (
    <ColorField
      label="Color"
      value={section.backgroundColor || ''}
      onChange={(color) => section.updateProperties({ backgroundColor: color || undefined })}
      allowEmpty
    />
  )}

  {section.backgroundGradient && (
    <GradientField
      value={section.backgroundGradient}
      onChange={(gradient) => section.updateProperties({ backgroundGradient: gradient })}
    />
  )}

  {!section.backgroundGradient && section.backgroundImage !== undefined && (
    <TextField
      label="Image URL"
      value={section.backgroundImage || ''}
      onChange={(url) => section.updateProperties({ backgroundImage: url || undefined })}
      placeholder="https://..."
    />
  )}
</div>
```

Also add the `clsx` import at the top:
```typescript
import clsx from 'clsx';
```

- [ ] **Step 3: Type-check**

```bash
pnpm -F @marlinjai/email-editor-ui run lint
```
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add packages/ui/src/inspector/properties/SectionProperties.tsx
git commit -m "feat(ui): add gradient mode selector to SectionProperties inspector"
```

---

## Task 9: ColumnProperties Inspector

**Files:**
- Modify: `packages/ui/src/inspector/properties/ColumnProperties.tsx`

- [ ] **Step 1: Apply the same background mode pattern**

Read `packages/ui/src/inspector/properties/ColumnProperties.tsx` first. Then add the same background mode toggle (Color / Gradient) as in Task 8, replacing the existing `ColorField` for `backgroundColor`. Columns don't support background images, so only show `color` and `gradient` modes.

Import `GradientField` from `'../fields'` and `BackgroundGradient` from `'@marlinjai/email-editor-core'`. Use `column.backgroundGradient` and `column.updateProperties({ backgroundGradient: ... })` for the gradient path.

- [ ] **Step 2: Type-check**

```bash
pnpm -F @marlinjai/email-editor-ui run lint
```
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add packages/ui/src/inspector/properties/ColumnProperties.tsx
git commit -m "feat(ui): add gradient mode selector to ColumnProperties inspector"
```

---

## Task 10: Build and Smoke Test

- [ ] **Step 1: Build all packages**

```bash
pnpm run build
```
Expected: all packages build with no errors

- [ ] **Step 2: Run full test suite**

```bash
pnpm run test
```
Expected: all tests pass (original 181 + new gradient tests)

- [ ] **Step 3: Start example app and manually verify**

```bash
pnpm -F email-editor-nextjs-example dev
```

Open `http://localhost:3000`. Select a section, open the inspector. Verify:
- Background mode tabs (Color / Gradient / Image) are visible
- Switching to Gradient shows a gradient editor with a preview swatch, type toggle, angle slider, and color stops
- Editing stops updates the canvas preview in real time
- Switching back to Color clears the gradient

- [ ] **Step 4: Verify compiled output**

If the example app has a compile/export button, trigger it and confirm the output HTML contains `linear-gradient` or `radial-gradient` in a `<style>` tag and the section's table cell has the fallback `bgcolor`.

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "feat: section and column background gradient support"
```
