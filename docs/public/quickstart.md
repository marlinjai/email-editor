---
title: Quick Start
description: Get up and running with the email editor
order: 2
icon: "🚀"
summary: Quick start guide for getting up and running with the email editor, covering installation, setup, and creating your first email template.
type: documentation
tags: [email-editor, quickstart, getting-started]
projects: [email-editor]
---

# Quick Start Guide

## Installation & Setup

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm run build

# Start the example app
pnpm -F email-editor-nextjs-example dev
```

Open http://localhost:3000 to see the editor in action.

## What You Get

### Editor Layer

- **Core Engine** - Framework-agnostic email template management with MobX State Tree (MST)
- **React UI** - 3-panel editor interface (sidebar, canvas, inspector)
- **14 Block Types** - Text, Image, Button, Divider, Spacer, Social, Hero, Accordion, Raw HTML, Navbar, Carousel, Table, Branded Header, Branded Footer
- **35 Prebuilt Templates** - Hero sections, feature grids, CTAs, footers, and more
- **MJML (Mailjet Markup Language) Compilation** - Server-side rendering to email-safe HTML
- **Undo/Redo** - Full history management via MST snapshots
- **Drag & Drop** - Intuitive block placement with dnd-kit
- **Device Preview** - Desktop and mobile views
- **Theming** - Customizable colors and fonts
- **Type Safe** - Full TypeScript support with Zod validation

### Platform Layer

- **Templates** - CRUD, versioning, dashboard UI
- **Contacts** - CSV import, segmentation, merge fields, unsubscribe handling
- **Campaigns** - Wizard, scheduling, A/B testing, send orchestration
- **Analytics** - Open/click/bounce tracking, heatmaps, engagement scoring
- **Teams** - Workspaces, roles, approval workflows, brand kit
- **Automation** - Trigger-based sequences, conditional logic, webhooks

## Next Steps

1. **Try the Example**
   ```bash
   pnpm -F email-editor-nextjs-example dev
   ```

2. **Read the Docs**
   - [Installation](./installation)
   - [API Reference](./api)

3. **Integrate into Your App**
   ```bash
   pnpm add @marlinjai/email-editor @marlinjai/email-editor-core react react-dom
   ```

   ```tsx
   'use client';

   import { useState } from 'react';
   import { EmailEditorReact, type TemplateSnapshotOut } from '@marlinjai/email-editor/react';
   import '@marlinjai/email-editor/styles.css';

   function App({ initial }: { initial?: TemplateSnapshotOut }) {
     const [doc, setDoc] = useState(initial);
     // The editor fills its container, so the container needs a height.
     return (
       <div style={{ height: '80vh' }}>
         <EmailEditorReact initialTemplate={initial} onChange={setDoc} />
       </div>
     );
   }
   ```

   The editor is uncontrolled: `initialTemplate` is read once on mount, and `onChange` receives the whole document, debounced by 300 ms. In Next.js, load it with `next/dynamic` and `ssr: false` from a `'use client'` file; see the [Integration](./integration) guide.

## Project Structure

```
email-editor/
├── packages/
│   ├── core/                    # JSON schema, MJML compiler, MST state
│   ├── ui/                      # React components (Canvas, Toolbar, Inspector)
│   ├── blocks/                  # 14 block types + 35 prebuilt templates
│   ├── editor/                  # Public API (createEditor, EmailEditorReact)
│   ├── templates/               # Template CRUD, versioning, dashboard
│   ├── contacts/                # Contacts, CSV import, segments
│   ├── campaigns/               # Campaign wizard, scheduling, A/B testing
│   ├── send-adapter-resend/     # Resend email provider adapter
│   ├── analytics/               # Tracking, heatmaps, engagement scoring
│   ├── teams/                   # Workspaces, roles, approvals, brand kit
│   ├── automation/              # Trigger sequences, conditional logic
│   └── shared/                  # Cross-package infrastructure
├── examples/
│   └── nextjs/                  # Working Next.js integration
└── docs/                        # Documentation
```

## Key Features

### 1. Clean Architecture

- **Core** is framework-agnostic (no React dependency)
- **UI** is pure React components with MobX observer bindings
- **Blocks** are pluggable and extensible
- **Editor** is the public-facing API
- **Platform** packages handle everything beyond editing

### 2. Type-Safe Schema

All templates are validated with Zod schemas. Invalid data is caught early.

### 3. MJML Compilation

Templates compile to MJML, then to email-safe HTML that works across all clients.

### 4. MobX State Tree

All state uses MST for fine-grained reactivity, type-safe actions, and snapshot-based undo/redo.

### 5. Customizable

- Redefine standard blocks (label, icon, default props) with the `blocks` option
- Theme colors and fonts
- Extend with your own UI

## Common Tasks

### Get Compiled HTML

Compilation runs on your server, never in the browser (`editor.getHTML()` is a placeholder that returns an empty string). Validate the document with `migrateTemplate` first:

```typescript
// app/api/compile/route.ts
import { migrateTemplate, isTemplateMigrationError } from '@marlinjai/email-editor-core';
import { createMJMLCompiler } from '@marlinjai/email-editor-core/server';

export async function POST(request: Request) {
  try {
    const doc = migrateTemplate(await request.json());
    const { html, mjml, errors } = createMJMLCompiler().compile(doc);
    return Response.json({ html, mjml, errors });
  } catch (error) {
    if (isTemplateMigrationError(error)) {
      const status = error.code === 'NEWER_VERSION' ? 422 : 400;
      return Response.json({ error: error.message, code: error.code, issues: error.issues }, { status });
    }
    throw error;
  }
}
```

### Save Template

```tsx
const [doc, setDoc] = useState<TemplateSnapshotOut>();

<EmailEditorReact
  initialTemplate={storedDoc}
  onChange={setDoc}
  onSave={async () => {
    await fetch('/api/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(doc),
    });
  }}
/>
```

`onSave` receives no arguments: keep the latest document from `onChange` and send that.

### Customize Theme

```tsx
import type { EditorTheme } from '@marlinjai/email-editor/react';

const theme: EditorTheme = {
  colors: {
    primary: '#944923',
    primaryHover: '#7a3c1d',
    surface: '#ffffff',
  },
  fonts: {
    body: 'Georgia, serif',
  },
};

<EmailEditorReact theme={theme} />
```

Each value sets an `--ee-*` design token on the editor's root element only. For finer control, override any `--ee-*` token on `.ee-root` in your own CSS, outside any `@layer`.

## Troubleshooting

**Build errors?**
Run `pnpm install` from the monorepo root.

**Import errors?**
Run `pnpm run build` to compile all packages.

**Styles not loading?**
Import `@marlinjai/email-editor/styles.css` once in your app. It is scoped under `.ee-root`, so no Tailwind configuration change is needed.

**Editor is blank or collapsed?**
The editor fills its container: give the container a height.

## Support

- [Full Documentation](./installation)
- [Example App](../../examples/nextjs)
