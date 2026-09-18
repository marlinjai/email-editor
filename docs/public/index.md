---
title: Email Editor
description: Visual drag-and-drop email template builder with full platform
order: 0
summary: Landing page for the Email Editor documentation, a visual drag-and-drop email template builder built on MobX State Tree with MJML export and full platform capabilities.
type: documentation
tags: [email-editor, index, drag-and-drop, mjml]
projects: [email-editor]
---

> **Note (2026-03-22):** Data Brain has been archived. Platform packages now consume the `DatabaseAdapter` interface from `@marlinjai/data-table-core` (pair with `@marlinjai/data-table-adapter-d1` or `@marlinjai/data-table-adapter-prisma`). The legacy `DataBrain*Adapter` classes are deprecated. The editor core layer is unaffected.

# Email Editor

A visual drag-and-drop email template builder built on MobX State Tree with MJML (Mailjet Markup Language) export, plus a full-featured email marketing platform.

## Platform Overview

The Email Editor is a **pnpm monorepo** with 12 packages organized into two layers:

### Editor Layer (4 packages)

| Package | Description |
|---------|-------------|
| `@marlinjai/email-editor-core` | Framework-agnostic engine: MST state, schema, block registry, MJML compiler |
| `@marlinjai/email-editor-ui` | React components: 3-panel editor, renderer, inspector, sidebar |
| `@marlinjai/email-editor-blocks` | 14 block types + 35 prebuilt section templates |
| `@marlinjai/email-editor` | High-level API: `createEditor()` and `EmailEditorReact` |

### Platform Layer (8 packages)

| Package | Description |
|---------|-------------|
| `@marlinjai/email-templates` | Template CRUD, versioning, dashboard UI |
| `@marlinjai/email-contacts` | Contacts, CSV import, segments, merge fields, unsubscribe |
| `@marlinjai/email-campaigns` | Campaign wizard, scheduling, A/B testing, send orchestration |
| `@marlinjai/email-send-adapter-resend` | Resend email provider adapter |
| `@marlinjai/email-analytics` | Open/click/bounce tracking, heatmaps, engagement scoring |
| `@marlinjai/email-teams` | Multi-user workspaces, roles, approval workflows, brand kit |
| `@marlinjai/email-automation` | Trigger-based sequences, conditional logic, webhooks |
| `@email-editor/shared` | Cross-package infrastructure: database adapter context, auth, workspace context (private, workspace-only, not published to npm) |

## Block Types

The editor ships with **14 block types** across four categories:

| Category | Blocks |
|----------|--------|
| **Text** | Text (rich text via TipTap) |
| **Media** | Image, Button, Hero, Carousel, Social |
| **Layout** | Divider, Spacer, Accordion, Navbar, Table, Raw HTML |
| **Brand** | Branded Header, Branded Footer (locked) |

Plus **35 prebuilt section templates** (hero sections, feature grids, CTAs, footers, etc.).

## SaaS Dashboard

The platform packages combine to form a complete SaaS email marketing dashboard with:

- Template management with version history
- Contact lists with CSV import and segmentation
- Campaign creation with A/B testing and scheduling
- Real-time analytics with click heatmaps and engagement scoring
- Team workspaces with role-based access and approval workflows
- Automation sequences with conditional branching

## Features

- **MobX State Tree** -- Fine-grained reactivity for instant editing (<16ms updates)
- **MJML Compilation** -- Server-side rendering to email-safe HTML
- **Undo/Redo** -- Full history management via MST snapshots
- **Drag & Drop** -- Intuitive block placement with dnd-kit
- **Device Preview** -- Desktop and mobile views
- **Theming** -- Customizable colors and fonts
- **Type Safe** -- Full TypeScript support with Zod validation
- **Database Agnostic** : All platform adapters consume the `DatabaseAdapter` interface from `@marlinjai/data-table-core` (works with D1, Prisma, or any custom adapter)

## Quick Start

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
      <EmailEditorReact
        initialTemplate={initial}
        onChange={setDoc}
        onSave={() =>
          fetch('/api/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(doc),
          })
        }
      />
    </div>
  );
}
```

The editor is uncontrolled: `initialTemplate` is read once on mount, and `onChange` receives the whole document (debounced by 300 ms). The stylesheet is scoped under `.ee-root`, so it is safe beside Tailwind CSS 4 and needs no Tailwind configuration. Compile the document to HTML on your server; see the [Integration](./integration) guide and `packages/editor/README.md` for Next.js setup, server compilation and the `onRequestImage` image picker hook.

## Documentation

- [Architecture](./architecture) -- Package layering, data flow, design decisions
- [Quick Start](./quickstart) -- Installation and setup
- [Installation](./installation) -- Detailed installation and platform packages
- [Integration](./integration) -- React, vanilla JS, and platform integration patterns
- [API Reference](./api) -- Full API documentation
- [Mail service API contract](./mail-contract): v1 schemas, routes, errors and webhook signing of the mail service
