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
pnpm install @marlinjai/email-editor
```

## Quick Start

### React Integration

```tsx
import { EmailEditorReact } from '@marlinjai/email-editor/react';
import '@marlinjai/email-editor/styles.css';
import { useState } from 'react';

function App() {
  const [template, setTemplate] = useState({
    version: '1.0',
    metadata: { subject: 'My Email' },
    sections: [],
  });

  return (
    <EmailEditorReact
      value={template}
      onChange={setTemplate}
      onSave={() => console.log('Saved!', template)}
    />
  );
}
```

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

// Get compiled HTML
const html = editor.getHTML();

// Clean up
editor.destroy();
```

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

### Undo/Redo

- **Cmd+Z** (Mac) or **Ctrl+Z** (Windows) - Undo
- **Cmd+Shift+Z** or **Ctrl+Shift+Z** - Redo

### Device Preview

Toggle between desktop and mobile views using the icons in the canvas toolbar.

## Theming

Customize the editor's appearance:

```tsx
const theme = {
  colors: {
    primary: '#944923',
    surface: '#ffffff',
    text: '#1a1a1a',
    border: '#e5e5e5',
  },
  fonts: {
    heading: 'Georgia, serif',
    body: 'Georgia, serif',
  },
};

<EmailEditorReact theme={theme} ... />
```

## Server-Side Compilation

For production use, compile MJML on the server:

```typescript
// API route (Next.js example)
import { createMJMLCompiler } from '@marlinjai/email-editor-core/server';

export async function POST(request) {
  const template = await request.json();
  const compiler = createMJMLCompiler();
  const { html, mjml } = compiler.compile(template);

  return Response.json({ html, mjml });
}
```

## Custom Blocks

Register your own custom blocks:

```typescript
import { createEditor } from '@marlinjai/email-editor';

const customBlock = {
  type: 'custom',
  label: 'Custom Block',
  category: 'text',
  defaultProps: { content: 'Hello' },
  propSchema: z.object({ content: z.string() }),
  toMJML: (block) => `<mj-text>${block.content}</mj-text>`,
};

const editor = createEditor({
  container: document.getElementById('editor'),
  blocks: [customBlock],
});
```

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
