---
title: Installation
description: Detailed installation instructions for the email editor monorepo
order: 3
---

# Installation Instructions

## Prerequisites

This monorepo uses **pnpm** for workspace management. You need to install it first.

### Install pnpm

```bash
# Using npm
npm install -g pnpm

# Or using Homebrew (macOS)
brew install pnpm

# Or using curl
curl -fsSL https://get.pnpm.io/install.sh | sh -
```

## Setup Steps

### 1. Install Dependencies

```bash
# From the monorepo root
pnpm install
```

This will install all dependencies for all packages.

### 2. Build All Packages

```bash
pnpm run build
```

This builds:
- `packages/core` - Schema, compiler, Zustand store
- `packages/ui` - React components
- `packages/blocks` - Block definitions
- `packages/editor` - Public API

### 3. Run Example App

```bash
cd examples/nextjs
pnpm run dev
```

Open http://localhost:3000 to see the editor.

## Using the Editor in Your App

### Basic Integration

```tsx
import { EmailEditorReact } from '@marlinjai/email-editor/react';
import '@marlinjai/email-editor/styles.css';

function App() {
  const [template, setTemplate] = useState(initialTemplate);

  return (
    <EmailEditorReact
      value={template}
      onChange={setTemplate}
      uploadAsset={uploadFn}
    />
  );
}
```

### With API Key (Production)

```tsx
<EmailEditorReact
  value={template}
  onChange={setTemplate}
  apiKey={process.env.EMAIL_EDITOR_API_KEY}
  compileEndpoint="https://api.returnhypnosis.com/compile"
/>
```

## Alternative: Use npm with Local Packages

If you prefer npm without workspaces:

1. Build each package individually:
   ```bash
   cd packages/core && npm install && npm run build
   cd ../ui && npm install && npm run build
   cd ../blocks && npm install && npm run build
   cd ../editor && npm install && npm run build
   ```

2. Link packages locally:
   ```bash
   cd packages/core && npm link
   cd ../ui && npm link @marlinjai/email-editor-core && npm link
   cd ../blocks && npm link @marlinjai/email-editor-core && npm link
   cd ../editor && npm link @marlinjai/email-editor-core @marlinjai/email-editor-ui @marlinjai/email-editor-blocks && npm link
   ```

3. Run example:
   ```bash
   cd examples/nextjs
   npm link @marlinjai/email-editor
   npm run dev
   ```

## Troubleshooting

### "Cannot find module" errors

Make sure all packages are built:
```bash
pnpm run build
```

### TypeScript errors

Clean and rebuild:
```bash
pnpm run clean
pnpm run build
```

### Port already in use

Change the port in `examples/nextjs`:
```bash
PORT=3001 pnpm run dev
```

### Zustand store not initializing

Ensure you're importing from the correct package:
```tsx
// Correct
import { useEditorStore } from '@marlinjai/email-editor-core';

// Wrong
import { useEditorStore } from '@marlinjai/email-editor-ui';
```

## Development Workflow

### Watch Mode

For active development, run packages in watch mode:

```bash
# Terminal 1: Watch core package
cd packages/core
pnpm run dev

# Terminal 2: Watch ui package
cd packages/ui
pnpm run dev

# Terminal 3: Run example app
cd examples/nextjs
pnpm run dev
```

Changes will rebuild automatically.

### Running Tests

```bash
# Run all tests
pnpm run test

# Run tests in watch mode
pnpm run test:watch
```

## Next Steps

Once installed, check out:

1. **[Quick Start](./quickstart)** - Quick overview
2. **[Integration](./integration)** - Integration patterns
3. **[API Reference](./api)** - API reference
