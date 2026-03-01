---
title: Internal Development
description: Development workflow, testing, and contributing guide
order: 0
icon: "🔒"
---

# Development Guide

## Setup

```bash
# Clone repository
git clone <repo-url>
cd email-editor

# Install dependencies (uses pnpm)
pnpm install

# Build all packages
pnpm run build

# Start development mode
pnpm run dev
```

## Monorepo Structure

```
email-editor/
├── packages/
│   ├── core/          # Schema, MJML compiler, MobX State Tree store
│   ├── ui/            # React UI components
│   ├── blocks/        # Standard block library
│   └── editor/        # Public API package
├── examples/
│   └── nextjs/        # Next.js integration example (deployed at email-editor.lumitra.co)
└── docs/
    ├── public/        # Public documentation (Clearify)
    └── internal/      # Internal development docs
```

## Package Dependencies

```
editor → ui → core
editor → blocks → core
```

## State Management Architecture

The editor uses **MobX State Tree (MST)** with a hierarchical model structure:

### Root Store
The top-level store composes template data and editor UI state:

```typescript
import { createRootStore } from '@marlinjai/email-editor-core';

const store = createRootStore({
  template: myTemplateSnapshot,
});
```

### Template Model
Handles template state and CRUD operations:

```typescript
// Access template data through the store
const template = store.template;
const sections = template.sections;

// Mutate via MST actions
template.addSection(sectionSnapshot);
template.removeSection(sectionId);
```

### Editor UI Store
Handles ephemeral UI state (selection, drag, preview device):

```typescript
const editorUI = store.editorUI;

// Selection
editorUI.setSelection('block', blockId);
const selectedId = editorUI.selectedId;

// Drag state
editorUI.startDrag(dragData);

// Preview device
editorUI.setPreviewDevice('mobile');
```

## Using the Store in React Components

### Via StoreProvider (from UI package)

```typescript
import { useStore } from '@marlinjai/email-editor-ui';

function BlockList() {
  const store = useStore();
  const template = store.template;

  return (
    <ul>
      {template.sections.map(section => (
        // ...
      ))}
    </ul>
  );
}
```

### Using useEditorActions Hook

For components that need many actions, use the bridge hook:

```typescript
import { useEditorActions } from '@marlinjai/email-editor-ui';

function MyToolbar() {
  const {
    template,
    addTextBlock,
    addImageBlock,
    undo,
    redo,
    canUndo,
    canRedo,
  } = useEditorActions();

  return (
    <div>
      <button onClick={() => addTextBlock(columnId)}>Add Text</button>
      <button onClick={undo} disabled={!canUndo}>Undo</button>
    </div>
  );
}
```

## Middleware

### History (Undo/Redo)
Undo/redo is built into the MST store via Immer patches:

```typescript
// Undo/redo via store actions
store.undo();
store.redo();
const canUndo = store.canUndo;
```

### Validation
Validates MJML constraints and provides fallbacks for drag-and-drop:

```typescript
import { validateDropIntent, computeValidatedDropIntent } from '@marlinjai/email-editor-core';

// Check if a drop is valid
const result = validateDropIntent(template, 'block', 'target-id', 'inside');
// { isValid: true } or { isValid: false, reason: '...', fallback: {...} }
```

## Development Workflow

### Building Packages

```bash
# Build all packages
pnpm run build

# Build specific package
cd packages/core
pnpm run build

# Watch mode
pnpm run dev
```

### Running Tests

```bash
# Run all tests
pnpm run test

# Run tests in watch mode
pnpm run test:watch

# Run tests for specific package
cd packages/core
pnpm run test
```

### Linting

```bash
# Lint all packages
pnpm run lint

# Lint specific package
cd packages/ui
pnpm run lint
```

## Making Changes

### Adding a New Block Type

1. Define the type in `packages/core/src/schema/types.ts`
2. Add Zod schema in `packages/core/src/schema/validation.ts`
3. Create block definition in `packages/blocks/src/<block-name>/index.ts`
4. Register in `packages/blocks/src/registry.ts`
5. Add MJML compilation logic in `packages/core/src/compiler/MJMLCompiler.ts`

### Adding UI Components

1. Create component in `packages/ui/src/<component>/`
2. Export from `packages/ui/src/index.ts`
3. Add styles in component file or `packages/ui/src/styles.css`
4. Update Tailwind config if needed

### Adding Store Actions

1. Add MST action in the appropriate model (`TemplateModel.ts`, `SectionModel.ts`, `BlockModel.ts`, or `EditorUIStore.ts`)
2. Export types from `packages/core/src/store/mst/index.ts`
3. Update React bindings in `packages/ui/` if needed

### Updating Core Logic

1. Make changes in `packages/core/src/`
2. Update types if needed
3. Add tests in `__tests__/` directory
4. Rebuild and test in example app

## Testing Strategy

### Unit Tests (Vitest)

Test core logic in isolation:

```typescript
// packages/core/src/compiler/__tests__/compiler.test.ts
import { describe, it, expect } from 'vitest';
import { createMJMLCompiler } from '../MJMLCompiler';

describe('MJMLCompiler', () => {
  it('compiles text block', () => {
    const compiler = createMJMLCompiler();
    const result = compiler.compile(/* template */);
    expect(result.html).toContain('Hello World');
  });
});
```

### Integration Tests

Test in example app:

```bash
cd examples/nextjs
pnpm run dev
```

Open browser and manually test features.

## Publishing

### Pre-publish Checklist

- [ ] All tests passing
- [ ] No linter errors
- [ ] Build successful
- [ ] Example app works
- [ ] Version bumped in all package.json
- [ ] CHANGELOG updated

### Publishing to NPM

```bash
# From monorepo root
pnpm run build

# Publish each package
cd packages/core
npm publish --access public

cd ../ui
npm publish --access public

cd ../blocks
npm publish --access public

cd ../editor
npm publish --access public
```

## Troubleshooting

### "Cannot find module" errors

Run `pnpm run build` from monorepo root.

### TypeScript errors in imports

Ensure `composite: true` in tsconfig.json and rebuild packages.

### Tailwind styles not applying

The example app uses Tailwind v3. Check that `tailwindcss` is running and CSS is imported. Do not upgrade to Tailwind v4 — the editor UI components are built against v3 classes.

### MJML compilation errors

Check the MJML syntax in block definitions and ensure official MJML package is installed. MJML compilation is server-side only — use the `/server` entry point from `@marlinjai/email-editor-core/server`.

### MST store state not updating

Make sure you're observing the correct MST node. Use `observer()` from `mobx-react-lite` to make React components reactive:

```typescript
import { observer } from 'mobx-react-lite';

const MyComponent = observer(() => {
  const store = useStore();
  // This component will re-render when observed MST properties change
  return <div>{store.template.name}</div>;
});
```

## Architecture Decisions

### Why MobX State Tree?

- Hierarchical models map naturally to email template structure (template > sections > columns > blocks)
- Built-in snapshots and patches enable undo/redo
- Type-safe actions enforce valid state transitions
- Observable properties give fine-grained React reactivity

### Why Monorepo?

- Share code between packages
- Single version management
- Easier development workflow

### Why Framework-Agnostic Core?

- Can be used without React
- Easier to test
- Better separation of concerns

### Why MJML?

- Industry standard for responsive emails
- Works across all email clients
- Better than hand-coding HTML tables

### Why Immer for Undo/Redo?

- Simpler immutable state snapshots
- Patch-based history is memory-efficient
- Integrates well with MST's snapshot system

### Why TipTap over Lexical?

- Simpler API
- Better documentation
- Easier to customize
- Sufficient for email use case

---

**Last updated:** 2026-02-21
