# Development Guide

## Setup

```bash
# Clone repository
git clone <repo-url>
cd email-editor

# Install dependencies
npm install

# Build all packages
npm run build

# Start development mode
npm run dev
```

## Monorepo Structure

```
email-editor/
├── packages/
│   ├── core/          # Framework-agnostic core
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

## Development Workflow

### Building Packages

```bash
# Build all packages
npm run build

# Build specific package
cd packages/core
npm run build

# Watch mode
npm run dev
```

### Running Tests

```bash
# Run all tests
npm run test

# Run tests in watch mode
npm run test:watch

# Run tests for specific package
cd packages/core
npm run test
```

### Linting

```bash
# Lint all packages
npm run lint

# Lint specific package
cd packages/ui
npm run lint
```

## Making Changes

### Adding a New Block Type

1. Define the type in `packages/core/src/schema/types.ts`
2. Add Zod schema in `packages/core/src/schema/validation.ts`
3. Create block definition in `packages/blocks/src/<block-name>/index.ts`
4. Register in `packages/blocks/src/registry.ts`
5. Add MJML compilation logic

### Adding UI Components

1. Create component in `packages/ui/src/<component>/`
2. Export from `packages/ui/src/index.ts`
3. Add styles in component file or `packages/ui/src/styles.css`
4. Update Tailwind config if needed

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
npm run dev
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
npm run build

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

Run `npm run build` from monorepo root.

### TypeScript errors in imports

Ensure `composite: true` in tsconfig.json and rebuild packages.

### Tailwind styles not applying

Check that `tailwindcss` is running and CSS is imported.

### MJML compilation errors

Check the MJML syntax in block definitions and ensure official MJML package is installed.

## Architecture Decisions

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

