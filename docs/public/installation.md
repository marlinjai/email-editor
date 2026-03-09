---
title: Installation
description: Detailed installation instructions for the email editor monorepo
order: 3
summary: Detailed installation instructions for the email editor pnpm monorepo, covering prerequisites, package setup, and build configuration.
category: documentation
tags: [email-editor, installation, pnpm, setup]
projects: [email-editor]
status: active
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

This builds the **editor layer** (4 packages):
- `packages/core` - Schema, MST store, MJML compiler
- `packages/ui` - React components
- `packages/blocks` - 14 block definitions + 35 prebuilt templates
- `packages/editor` - Public API

And the **platform layer** (8 packages):
- `packages/templates` - Template CRUD, versioning, dashboard
- `packages/contacts` - Contacts, CSV import, segments, merge fields
- `packages/campaigns` - Campaign wizard, scheduling, A/B testing
- `packages/send-adapter-resend` - Resend email provider adapter
- `packages/analytics` - Tracking, heatmaps, engagement scoring
- `packages/teams` - Workspaces, roles, approvals, brand kit
- `packages/automation` - Trigger sequences, conditional logic
- `packages/shared` - Cross-package infrastructure

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
  compileEndpoint="/api/compile"
/>
```

## Installing Platform Packages

The platform packages are installed individually as needed:

```bash
# Template management
pnpm install @marlinjai/email-templates

# Contact management
pnpm install @marlinjai/email-contacts

# Campaign management
pnpm install @marlinjai/email-campaigns

# Send adapter (Resend provider)
pnpm install @marlinjai/email-send-adapter-resend

# Analytics & tracking
pnpm install @marlinjai/email-analytics

# Teams & workspaces
pnpm install @marlinjai/email-teams

# Automation sequences
pnpm install @marlinjai/email-automation
```

All platform packages use **Data Brain** as their storage backend via adapter classes. See the [Integration](./integration) guide for setup examples.

## Alternative: Use npm with Local Packages

If you prefer npm without workspaces:

1. Build each package individually:
   ```bash
   cd packages/core && pnpm install && pnpm run build
   cd ../ui && pnpm install && pnpm run build
   cd ../blocks && pnpm install && pnpm run build
   cd ../editor && pnpm install && pnpm run build
   ```

2. Link packages locally:
   ```bash
   cd packages/core && pnpm link --global
   cd ../ui && pnpm link --global @marlinjai/email-editor-core && pnpm link --global
   cd ../blocks && pnpm link --global @marlinjai/email-editor-core && pnpm link --global
   cd ../editor && pnpm link --global @marlinjai/email-editor-core @marlinjai/email-editor-ui @marlinjai/email-editor-blocks && pnpm link --global
   ```

3. Run example:
   ```bash
   cd examples/nextjs
   pnpm link --global @marlinjai/email-editor
   pnpm run dev
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

### MST store not initializing

Ensure you're importing from the correct package:
```tsx
// Correct - import store from core
import { createRootStore } from '@marlinjai/email-editor-core';

// Correct - use the high-level React wrapper
import { EmailEditorReact } from '@marlinjai/email-editor/react';
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
