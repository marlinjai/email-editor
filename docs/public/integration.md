---
title: Integration
description: React, vanilla JS, and platform integration patterns
order: 4
summary: Integration patterns for using @marlinjai/email-editor in React applications, vanilla JS, and platform contexts with code examples.
type: documentation
tags: [email-editor, integration, react, patterns]
projects: [email-editor]
---

> **Note (2026-03-22):** Data Brain has been archived. Platform packages now consume the generic `DatabaseAdapter` interface from `@marlinjai/data-table-core`. Use `@marlinjai/data-table-adapter-d1` (Cloudflare D1) or `@marlinjai/data-table-adapter-prisma` (PostgreSQL) as the concrete adapter. The legacy `DataBrain*Adapter` classes are deprecated.

# Getting Started with @marlinjai/email-editor

## Installation

```bash
pnpm add @marlinjai/email-editor @marlinjai/email-editor-core react react-dom
```

`@marlinjai/email-editor-core` is needed directly for validating and compiling documents on your server.

## Quick Start

### React Integration

```tsx
'use client';

import { useState } from 'react';
import {
  EmailEditorReact,
  type TemplateSnapshotIn,
  type TemplateSnapshotOut,
} from '@marlinjai/email-editor/react';
import '@marlinjai/email-editor/styles.css';

const initialTemplate: TemplateSnapshotIn = {
  id: 'welcome-email',
  version: '1.0',
  metadata: { subject: 'My Email' },
  sections: [],
};

function App() {
  const [doc, setDoc] = useState<TemplateSnapshotOut>();

  // The editor fills its container, so the container needs a height.
  return (
    <div style={{ height: '80vh' }}>
      <EmailEditorReact
        initialTemplate={initialTemplate}
        onChange={setDoc}
        onSave={() => console.log('Saved!', doc)}
      />
    </div>
  );
}
```

The editor is uncontrolled: `initialTemplate` is read once on mount (remount with a new `key` to load a different document), and `onChange` receives the whole document, debounced by 300 ms. Other props: `onExport(doc)` shows an Export button, `onNavigateBack()` shows a back arrow, `onRequestImage` plugs in your image picker, `blocks` registers extra block types and `theme` brands the editor chrome.

### Next.js (App Router)

The editor runs in the browser only, so load it with `next/dynamic` and `ssr: false` from a `'use client'` file:

```tsx
// app/compose/page.tsx
'use client';

import dynamic from 'next/dynamic';
import '@marlinjai/email-editor/styles.css';

const EmailEditorReact = dynamic(
  () => import('@marlinjai/email-editor/react').then((mod) => mod.EmailEditorReact),
  { ssr: false, loading: () => <p>Loading editor...</p> }
);

export default function ComposePage() {
  return (
    <div style={{ height: '100vh' }}>
      <EmailEditorReact onChange={(doc) => console.log(doc)} />
    </div>
  );
}
```

`next.config.ts` keeps MJML (the Mailjet Markup Language compiler, Node-only) out of the server bundle:

```ts
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // MJML is Node-only and loads files at runtime: keep it out of the server bundle.
  serverExternalPackages: ['mjml', 'mjml-core', 'mjml-parser-xml', 'mjml-preset-core', 'mjml-validator'],
};

export default nextConfig;
```

`transpilePackages` is not needed: the packages ship compiled ECMAScript modules (ESM) and CommonJS. The repository's `examples/nextjs` app runs this setup on Next.js 16, React 19 and Tailwind CSS 4.

### Vanilla JavaScript

```javascript
import { createEditor } from '@marlinjai/email-editor';
import '@marlinjai/email-editor/styles.css';

const editor = createEditor({
  container: document.getElementById('editor'),
  initialValue: {
    version: '1.0',
    metadata: { subject: 'My Email' },
    sections: [],
  },
  onChange: (template) => {
    console.log('Template changed:', template);
  },
});

// Clean up
editor.destroy();
```

`createEditor` still needs `react` and `react-dom` installed, but your app does not have to use React. To get HTML, send the document from `onChange` to your server and compile it there (see [Server-Side Compilation](#server-side-compilation)); `editor.getHTML()` is a placeholder that returns an empty string.

## Core Concepts

### EmailTemplate Structure

```typescript
interface EmailTemplate {
  version: '1.0';
  metadata: {
    subject?: string;
    previewText?: string;
  };
  sections: Section[];
}
```

### Available Blocks

Drag blocks from the left toolbar onto the canvas. The editor ships with **14 block types**:

| Category | Blocks |
|----------|--------|
| **Text** | Text (rich text via TipTap) |
| **Media** | Image, Button, Hero, Carousel, Social |
| **Layout** | Divider, Spacer, Accordion, Navbar, Table, Raw HTML |
| **Brand** | Branded Header, Branded Footer (locked) |

### Editing Properties

Click any block to select it. The right panel shows editable properties like colors, alignment, and text.

### Images

Without further setup, the image block's inspector shows a plain URL field. Pass `onRequestImage` (to `EmailEditorReact` or `createEditor`) to show a Choose image button that opens your own picker or uploader instead. It resolves with `{ url, alt? }`, or `null` to cancel. See the "Your own image picker" section of `packages/editor/README.md` for the full contract.

### Undo/Redo

- **Cmd+Z** (Mac) or **Ctrl+Z** (Windows) - Undo
- **Cmd+Shift+Z** or **Ctrl+Shift+Z** - Redo

### Device Preview

Toggle between desktop and mobile views using the icons in the canvas toolbar.

## Theming

Import `@marlinjai/email-editor/styles.css` once. Every rule in it is scoped under the editor's root element (`.ee-root`), so it does not restyle your page and is safe beside Tailwind CSS 4. Nothing in your Tailwind configuration needs to change.

Customize the editor chrome with the `theme` prop:

```tsx
import type { EditorTheme } from '@marlinjai/email-editor/react';

const theme: EditorTheme = {
  colors: {
    primary: '#944923',
    primaryHover: '#7a3c1d',
    surface: '#ffffff',
    text: '#1a1a1a',
    border: '#e5e5e5',
  },
  fonts: {
    body: 'Georgia, serif',
  },
};

<EmailEditorReact theme={theme} />
```

Each value sets an `--ee-*` design token on the editor's root element only. For finer control, override any `--ee-*` token in your own CSS, outside any `@layer` (the editor's stylesheet is unlayered and wins over layered rules):

```css
.ee-root {
  --ee-midnight-2: #0b1220; /* toolbar background */
}
```

## Server-Side Compilation

Compile on the server, never in the browser (MJML is a large Node.js dependency). Validate the document with `migrateTemplate` first:

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

Never import `@marlinjai/email-editor-core/server` from client code. Run stored documents through `migrateTemplate` when you load them, too.

## Redefining Blocks

The `blocks` option replaces the definition of a standard block type, for example to rename it in the palette or change what a newly dropped block contains:

```typescript
import { createEditor } from '@marlinjai/email-editor';
import { createStandardBlockRegistry } from '@marlinjai/email-editor-blocks';

const text = createStandardBlockRegistry().get('text')!;

const editor = createEditor({
  container: document.getElementById('editor')!,
  blocks: [{ ...text, label: 'Paragraph', defaultProps: { ...text.defaultProps, content: '<p>Write here</p>' } }],
});
```

New block types are not supported yet: the document schema, the canvas and the server compiler only know the 14 standard types, so a definition with any other `type` is refused with an error when the editor is created.

## Platform Integration

The platform packages extend the editor into a full email marketing solution. All platform adapters use the `DatabaseAdapter` interface from `@marlinjai/data-table-core` for storage. Pair with `@marlinjai/data-table-adapter-d1` for Cloudflare D1 or `@marlinjai/data-table-adapter-prisma` for PostgreSQL.

### Template Management

```typescript
import { TemplateManager, createTemplateAdapter } from '@marlinjai/email-templates';
import { D1Adapter } from '@marlinjai/data-table-adapter-d1';

const dbAdapter = new D1Adapter({ db: env.DB });
const adapter = createTemplateAdapter({
  database: dbAdapter,
  workspaceId: 'ws_123',
});

const manager = new TemplateManager({ adapter });

// Create a template
const template = await manager.create({
  name: 'Welcome Email',
  content: editorTemplate,
});

// List templates with versioning
const templates = await manager.list({ status: 'published' });
```

### Contact Management

```typescript
import { WorkspaceScopedContactManager, importCSV } from '@marlinjai/email-contacts';

const contactManager = new WorkspaceScopedContactManager({
  adapter: contactAdapter,
  workspaceId: 'ws_123',
});

// Import contacts from CSV
const result = await importCSV(csvString, {
  mapping: { email: 'Email', firstName: 'First Name' },
  adapter: contactAdapter,
});

// Evaluate segments
import { evaluateSegmentGroup } from '@marlinjai/email-contacts';
const matches = evaluateSegmentGroup(contacts, segmentRules);
```

### Campaign Sending

```typescript
import { CampaignManager } from '@marlinjai/email-campaigns';
import { ResendSendAdapter } from '@marlinjai/email-send-adapter-resend';

const sendAdapter = new ResendSendAdapter({
  apiKey: process.env.RESEND_API_KEY,
});

const campaignManager = new CampaignManager({
  adapter: campaignAdapter,
  sendAdapter,
});

// Schedule a campaign
await campaignManager.schedule({
  campaignId: 'camp_123',
  scheduledAt: new Date('2026-03-15T10:00:00Z'),
});
```

### Analytics & Tracking

```typescript
import { AnalyticsTracker, handleOpenTrack, handleClickTrack } from '@marlinjai/email-analytics';
import { injectTrackingPixel, rewriteLinksForTracking } from '@marlinjai/email-campaigns';

// Inject tracking into compiled HTML
const trackedHtml = injectTrackingPixel(html, { campaignId, contactId });
const linkedHtml = rewriteLinksForTracking(trackedHtml, { campaignId, contactId });

// Handle tracking endpoints
app.get('/track/open', (req) => handleOpenTrack(req));
app.get('/track/click', (req) => handleClickTrack(req));

// Generate heatmaps
import { generateHeatmapData } from '@marlinjai/email-analytics';
const heatmap = generateHeatmapData(clickEvents);
```

### Teams & Workspaces

```typescript
import { WorkspaceManager, ApprovalManager, BrandKitManager } from '@marlinjai/email-teams';

const workspaceManager = new WorkspaceManager({ adapter: teamsAdapter });

// Brand kit for consistent styling
const brandKit = await brandKitManager.get('ws_123');
// => { colors: [...], fonts: [...], logos: [...] }

// Approval workflows
const approval = await approvalManager.submit({
  resourceType: 'campaign',
  resourceId: 'camp_123',
  requestedBy: 'user_456',
});
```

### Automation Sequences

```typescript
import { AutomationEngine, createAutomationAdapter } from '@marlinjai/email-automation';
import { D1Adapter } from '@marlinjai/data-table-adapter-d1';

const automationAdapter = createAutomationAdapter({
  database: new D1Adapter({ db: env.DB }),
  workspaceId: 'ws_123',
});

const engine = new AutomationEngine({
  adapter: automationAdapter,
  sendAdapter,
});

// Steps include: send_email, wait, condition, split
// Triggers include: event, schedule, manual
```

### Shared Infrastructure

`@email-editor/shared` is a private, workspace-only package inside this monorepo; it is not published to npm.

```typescript
import { PlatformProvider, useDatabase, useStorageBrain } from '@email-editor/shared';
import { D1Adapter } from '@marlinjai/data-table-adapter-d1';

// Wrap your app with platform context
function App() {
  const database = new D1Adapter({ db: env.DB });
  return (
    <PlatformProvider
      database={database}
      storageBrain={{ baseUrl: '...', apiKey: '...' }}
    >
      <Dashboard />
    </PlatformProvider>
  );
}
```

## Next Steps

- See the [Next.js example](../../examples/nextjs) for a complete integration
- Read the [API Reference](./api) for detailed documentation
- Check the [Architecture](./architecture) for design decisions
