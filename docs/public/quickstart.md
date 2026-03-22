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

# Start example app
cd examples/nextjs
pnpm run dev
```

Open http://localhost:3000 to see the editor in action.

## What You Get

### Editor Layer

- **Core Engine** - Framework-agnostic email template management with MobX State Tree
- **React UI** - 3-panel editor interface (sidebar, canvas, inspector)
- **14 Block Types** - Text, Image, Button, Divider, Spacer, Social, Hero, Accordion, Raw HTML, Navbar, Carousel, Table, Branded Header, Branded Footer
- **35 Prebuilt Templates** - Hero sections, feature grids, CTAs, footers, and more
- **MJML Compilation** - Server-side rendering to email-safe HTML
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
   cd examples/nextjs
   pnpm run dev
   ```

2. **Read the Docs**
   - [Installation](./installation)
   - [API Reference](./api)

3. **Integrate into Your App**
   ```bash
   pnpm install @marlinjai/email-editor
   ```

   ```tsx
   import { EmailEditorReact } from '@marlinjai/email-editor/react';
   import '@marlinjai/email-editor/styles.css';

   function App() {
     const [template, setTemplate] = useState(/* ... */);
     return <EmailEditorReact value={template} onChange={setTemplate} />;
   }
   ```

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

- Add custom blocks
- Theme colors and fonts
- Extend with your own UI

## Common Tasks

### Get Compiled HTML

```typescript
const editor = createEditor({ container });
const html = editor.getHTML();
```

### Save Template

```typescript
<EmailEditorReact
  value={template}
  onChange={setTemplate}
  onSave={async () => {
    await fetch('/api/save', {
      method: 'POST',
      body: JSON.stringify(template),
    });
  }}
/>
```

### Customize Theme

```typescript
const theme = {
  colors: {
    primary: '#944923',
    surface: '#ffffff',
  },
  fonts: {
    heading: 'Georgia, serif',
  },
};

<EmailEditorReact theme={theme} ... />
```

## Troubleshooting

**Build errors?**
Run `pnpm install` from the monorepo root.

**Import errors?**
Run `pnpm run build` to compile all packages.

**Styles not loading?**
Import `@marlinjai/email-editor/styles.css` in your app.

## Support

- [Full Documentation](./installation)
- [Example App](../../examples/nextjs)
