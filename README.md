# @marlinjai/email-editor

**A standalone, pluggable email editor built with MJML, React, and TypeScript.**

Replace GrapesJS and Unlayer with a fully controllable, customizable email editor that you own.

---

## Features

- **MJML Compilation** - Email-safe HTML that works across all clients
- **React UI** - Clean 3-panel interface (Toolbar | Canvas | Inspector)
- **Type-Safe** - Full TypeScript with Zod validation
- **Centralized State** - Zustand store with document/interaction/api slices
- **Drag & Drop** - Intuitive block placement with 3-way drop intent
- **Undo/Redo** - Efficient history with Immer patches
- **Device Preview** - Desktop and mobile views
- **Rich Text** - TipTap editor for text blocks
- **Themeable** - Customize colors and fonts
- **Extensible** - Add custom blocks easily
- **MJML-Aware** - Validation middleware prevents invalid states
- **API Ready** - Optional compile API for production (coming soon)

---

## Quick Start

```bash
# Install
npm install @marlinjai/email-editor
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

| Package | Description |
|---------|-------------|
| `@marlinjai/email-editor` | Main package (public API + React wrapper) |
| `@marlinjai/email-editor-core` | Schema, compiler, Zustand store |
| `@marlinjai/email-editor-ui` | React UI components |
| `@marlinjai/email-editor-blocks` | Standard block library |

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
│  │ React          │ │  │  │ Zustand Store │  │
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

The editor uses Zustand with three slices:

**Document Slice** - Template state (sections, columns, blocks)
```typescript
const template = useEditorStore((s) => s.document.template);
const insertBlock = useEditorStore((s) => s.document.insertBlock);
```

**Interaction Slice** - UI state (selection, drag, resize)
```typescript
const selectedId = useEditorStore((s) => s.interaction.selectedId);
const setSelection = useEditorStore((s) => s.interaction.setSelection);
```

**API Slice** - Compile configuration
```typescript
const apiKey = useEditorStore((s) => s.api.apiKey);
```

---

## Available Blocks

### Standard Blocks
- **Text** - Rich text with formatting (bold, italic, links, headings)
- **Image** - Images with optional links and alt text
- **Button** - Call-to-action buttons with custom styling
- **Divider** - Horizontal separator lines
- **Spacer** - Vertical spacing control

### Branded Blocks (ReTurn)
- **Header** - Locked branded header with logo
- **Footer** - Locked branded footer with unsubscribe

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
- Zustand (state management)
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

## Made for ReTurn Hypnosis

Built with care to power beautiful email newsletters.
