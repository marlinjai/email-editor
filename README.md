---
title: Email Editor
summary: README for the Email Editor, a standalone pluggable email editor built with MJML, React, and MobX State Tree. Includes a full SaaS platform with template management, contacts, campaigns, analytics, teams, and automation packages.
category: documentation
tags: [email-editor, mjml, react, saas, drag-and-drop]
status: active
date: 2026-02-10
---

# @marlinjai/email-editor

**A standalone, pluggable email editor built with MJML, React, and TypeScript.**

Replace GrapesJS and Unlayer with a fully controllable, customizable email editor that you own.

---

## Features

### Editor
- **MJML Compilation** - Email-safe HTML that works across all clients
- **React UI** - Clean 3-panel interface (Toolbar | Canvas | Inspector)
- **Type-Safe** - Full TypeScript with Zod validation
- **MobX State Tree** - Hierarchical state management with snapshots and patches
- **Drag & Drop** - Intuitive block placement with 3-way drop intent
- **Undo/Redo** - Efficient history with Immer patches
- **Device Preview** - Desktop and mobile views
- **Rich Text** - TipTap editor for text blocks
- **Themeable** - Customize colors and fonts
- **Extensible** - Add custom blocks easily
- **14 Block Types** - Text, Image, Button, Divider, Spacer, Social, Navbar, Carousel, Accordion, Table, Header, Footer, Hero, Raw HTML

### Platform
- **Template Management** - Library dashboard, CRUD, versioning, import/export, categories
- **Contacts & Audiences** - Contact lists, CSV import, segments, merge fields, unsubscribe management
- **Campaign Builder** - Creation wizard, scheduling, A/B testing, Resend integration
- **Analytics** - Open/click/bounce tracking, heatmaps, engagement scoring, CSV export
- **Teams & Workspaces** - Multi-user roles, approval workflows, template locking, audit trail, brand kit
- **Automation** - Trigger-based sequences, conditional logic, webhook integration

---

## Quick Start

```bash
# Install
pnpm add @marlinjai/email-editor
```

```tsx
// Use in React
import { EmailEditorReact } from '@marlinjai/email-editor/react';
import '@marlinjai/email-editor/styles.css';

function App() {
  const [template, setTemplate] = useState({
    version: '1.0',
    metadata: { subject: 'My Email' },
    sections: [],
  });

  return <EmailEditorReact value={template} onChange={setTemplate} />;
}
```

See [docs/getting-started/quickstart.md](docs/getting-started/quickstart.md)

---

## Packages

### Editor
| Package | Description |
|---------|-------------|
| `@marlinjai/email-editor` | Main package (public API + React wrapper) |
| `@marlinjai/email-editor-core` | Schema, MJML compiler, MobX State Tree store |
| `@marlinjai/email-editor-ui` | React UI components |
| `@marlinjai/email-editor-blocks` | Standard block library (14 block types) |

### Infrastructure
| Package | Description |
|---------|-------------|
| `@email-editor/shared` | Client factories, context providers, schema bootstrapper |

### Platform
| Package | Description |
|---------|-------------|
| `@marlinjai/email-templates` | Template management with versioning and Data Brain storage |
| `@marlinjai/email-contacts` | Contact lists, segments, CSV import, unsubscribe management |
| `@marlinjai/email-campaigns` | Campaign builder with scheduling and A/B testing |
| `@marlinjai/email-send-adapter-resend` | Resend email sending adapter |
| `@marlinjai/email-analytics` | Tracking, heatmaps, engagement scoring, reports |
| `@marlinjai/email-teams` | Workspaces, roles, approvals, audit trail, brand kit |
| `@marlinjai/email-automation` | Trigger-based sequences and conditional workflows |

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│           Your App (Next.js, React, etc.)               │
└──────────────────────┬──────────────────────────────────┘
                  │ imports
┌──────────────────────▼──────────────────────────────────┐
│            @marlinjai/email-editor                  │
│  ├─ createEditor() - Vanilla JS API                     │
│  └─ EmailEditorReact - React component                  │
└──────────────────────┬──────────────────────────────────┘
                  │
          ┌────────────┴────────────┐
          │                         │
┌─────────▼───────────┐  ┌──────────▼──────────┐
│  email-editor-ui    │  │  email-editor-core  │
│  ┌────────────────┐ │  │  ┌───────────────┐  │
│  │ React          │ │  │  │ MST Store     │  │
│  │ Components     │ │  │  │ ├─ document   │  │
│  │ ├─ Canvas      │ │  │  │ ├─ interaction│  │
│  │ ├─ Toolbar     │ │  │  │ └─ api        │  │
│  │ ├─ Inspector   │ │  │  └───────────────┘  │
│  │ ├─ Layers      │ │  │  ┌───────────────┐  │
│  │ └─ Hooks       │ │  │  │ Middleware    │  │
│  └────────────────┘ │  │  │ ├─ history    │  │
└─────────────────────┘  │  │ └─ validation │  │
                         │  └───────────────┘  │
                         │  ┌───────────────┐  │
                         │  │ Compiler      │  │
                         │  │ (MJML→HTML)   │  │
                         │  └───────────────┘  │
                         └─────────────────────┘
```

---

## State Management

The editor uses **MobX State Tree (MST)** with a hierarchical model structure:

**Template Model** - Template state (sections, columns, blocks)
```typescript
import { createRootStore } from '@marlinjai/email-editor-core';

const store = createRootStore({ template: myTemplateSnapshot });
const template = store.template;
template.addSection(sectionSnapshot);
```

**Editor UI Store** - UI state (selection, drag, preview device)
```typescript
const editorUI = store.editorUI;
editorUI.setSelection('block', blockId);
editorUI.setPreviewDevice('mobile');
```

**Undo/Redo** - Built-in via Immer patches
```typescript
store.undo();
store.redo();
```

---

## Available Blocks

### Standard Blocks
- **Text** - Rich text with formatting (bold, italic, links, headings)
- **Image** - Images with optional links and alt text
- **Button** - Call-to-action buttons with custom styling
- **Divider** - Horizontal separator lines
- **Spacer** - Vertical spacing control

### Layout & Structure
- **Header** - Branded header with logo
- **Footer** - Branded footer with unsubscribe
- **Accordion** - Interactive expand/collapse sections
- **Navbar** - Navigation links with hamburger icon
- **Carousel** - Image slideshow with thumbnails
- **Table** - Data table with headers and rows
- **Hero** - Full-width hero section
- **Social** - Social media icon links
- **Raw HTML** - Custom HTML injection

---

## Development

```bash
# Clone and install
git clone <repo-url>
cd email-editor
pnpm install

# Build all packages
pnpm run build

# Start example app
cd examples/nextjs
pnpm run dev
```

See [docs/guides/development.md](docs/guides/development.md)

---

## Documentation

- [Getting Started](docs/getting-started/integration.md) - Installation and basic usage
- [API Reference](docs/guides/api.md) - Complete API documentation
- [Development Guide](docs/guides/development.md) - Contributing and architecture
- [Installation](docs/getting-started/installation.md) - Setup instructions
- [Quick Start](docs/getting-started/quickstart.md) - 5-minute overview

---

## Tech Stack

**Core**
- TypeScript (strict mode)
- Zod (schema validation)
- MobX State Tree (state management)
- Immer (immutable updates)
- MJML (email compilation)

**UI**
- React 18
- Tailwind CSS
- Radix UI (accessible components)
- dnd-kit (drag and drop)
- TipTap (rich text editing)
- Lucide React (icons)

**Build**
- Turborepo (monorepo)
- tsup (bundling)
- Vitest (testing)

---

## Why This Exists

**Problems with existing solutions:**
- GrapesJS: Complex, outdated UI, hard to customize
- Unlayer: Expensive, closed-source, limited control
- Building from scratch: Too time-consuming

**This editor provides:**
- Full control over UI/UX
- No vendor lock-in
- Extensible architecture
- Production-ready code
- Type-safe from the ground up

---

## API Monetization (Coming Soon)

| Tier | Price | Limits |
|------|-------|--------|
| Free | $0 | 100 compiles/month (watermark) |
| Pro | $29/mo | 10,000 compiles/month |
| Scale | $99/mo | 100,000 compiles/month |

---

## License

MIT License - See LICENSE file for details

---

## Contributing

Contributions welcome! See [docs/guides/development.md](docs/guides/development.md) for guidelines.

---

## Made by MarlinJai

Built with care to power beautiful email campaigns.
