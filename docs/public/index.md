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

A visual drag-and-drop email template builder built on MobX State Tree with MJML export, plus a full-featured email marketing platform.

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
| `@email-editor/shared` | Cross-package infrastructure: database adapter context, auth, workspace context |

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
pnpm install @marlinjai/email-editor
```

```tsx
import { EmailEditorReact } from '@marlinjai/email-editor/react';
import '@marlinjai/email-editor/styles.css';

function App() {
  const [template, setTemplate] = useState(initialTemplate);
  return <EmailEditorReact value={template} onChange={setTemplate} />;
}
```

## Documentation

- [Architecture](./architecture) -- Package layering, data flow, design decisions
- [Quick Start](./quickstart) -- Installation and setup
- [Installation](./installation) -- Detailed installation and platform packages
- [Integration](./integration) -- React, vanilla JS, and platform integration patterns
- [API Reference](./api) -- Full API documentation
