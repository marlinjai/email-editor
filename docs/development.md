---
title: Development
description: Development workflow, testing, and contributing guide
order: 6
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
│   ├── core/          # Schema, compiler, Zustand store
│   ├── ui/            # React UI components
│   ├── blocks/        # Standard block library
│   └── editor/        # Public API package
├── examples/
│   └── nextjs/        # Next.js integration example
└── docs/              # Documentation
```

## Package Dependencies

```
editor → ui → core
editor → blocks → core
```

## State Management Architecture

The editor uses Zustand with three slices:

### Document Slice
Handles template state and CRUD operations:

```typescript
import { useEditorStore } from '@returnhypnosis/email-editor-core';

function MyComponent() {
  const template = useEditorStore((s) => s.document.template);
  const insertBlock = useEditorStore((s) => s.document.insertBlock);
  const undo = useEditorStore((s) => s.document.undo);
}
```

### Interaction Slice
Handles ephemeral UI state:

```typescript
const selectedId = useEditorStore((s) => s.interaction.selectedId);
const dragState = useEditorStore((s) => s.interaction.dragState);
const setSelection = useEditorStore((s) => s.interaction.setSelection);
```

### API Slice
Handles compile endpoint configuration:

```typescript
const apiKey = useEditorStore((s) => s.api.apiKey);
const setApiKey = useEditorStore((s) => s.api.setApiKey);
```

## Using the Store in Components

### Direct Store Access

```typescript
import { useEditorStore } from '@returnhypnosis/email-editor-core';

function BlockList() {
  const template = useEditorStore((s) => s.document.template);
  const deleteBlock = useEditorStore((s) => s.document.deleteBlock);
  
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
import { useEditorActions } from '@returnhypnosis/email-editor-ui';

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

### History Middleware
Automatically tracks document changes for undo/redo:

```typescript
// Undo/redo works automatically
const undo = useEditorStore((s) => s.document.undo);
const redo = useEditorStore((s) => s.document.redo);
const canUndo = useEditorStore((s) => s.document.canUndo);
```

### Validation Middleware
Validates MJML constraints and provides fallbacks:

```typescript
import { validateDropIntent, computeValidatedDropIntent } from '@returnhypnosis/email-editor-core';

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

1. Define action type in `packages/core/src/store/types.ts`
2. Implement in appropriate slice (`documentSlice.ts`, `interactionSlice.ts`, or `apiSlice.ts`)
3. Export from `packages/core/src/store/index.ts`

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

Check that `tailwindcss` is running and CSS is imported.

### MJML compilation errors

Check the MJML syntax in block definitions and ensure official MJML package is installed.

### Zustand store state not updating

Make sure you're using selectors to avoid unnecessary re-renders:

```typescript
// Good - only re-renders when template changes
const template = useEditorStore((s) => s.document.template);

// Bad - re-renders on any store change
const store = useEditorStore();
const template = store.document.template;
```

## Architecture Decisions

### Why Zustand?

- Simple API, minimal boilerplate
- Built-in support for middleware (history, validation)
- Great TypeScript support
- Works well with React DevTools

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

### Why Immer for State?

- Simpler immutable updates
- Critical for undo/redo
- Better developer experience

### Why TipTap over Lexical?

- Simpler API
- Better documentation
- Easier to customize
- Sufficient for email use case

---

**Last updated:** 2026-01-04
