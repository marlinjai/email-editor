# @returnhypnosis/email-editor

**A standalone, pluggable email editor built with MJML, React, and TypeScript.**

Replace GrapesJS and Unlayer with a fully controllable, customizable email editor that you own.

---

## ✨ Features

- ✅ **MJML Compilation** - Email-safe HTML that works across all clients
- ✅ **React UI** - Clean 3-panel interface (Toolbar | Canvas | Inspector)
- ✅ **Type-Safe** - Full TypeScript with Zod validation
- ✅ **Drag & Drop** - Intuitive block placement with dnd-kit
- ✅ **Undo/Redo** - Full history management with Immer
- ✅ **Device Preview** - Desktop and mobile views
- ✅ **Rich Text** - TipTap editor for text blocks
- ✅ **Themeable** - Customize colors and fonts
- ✅ **Extensible** - Add custom blocks easily
- ✅ **Framework-Agnostic Core** - Use with or without React

---

## 🚀 Quick Start

```bash
# Install
npm install @returnhypnosis/email-editor

# Use in React
import { EmailEditorReact } from '@returnhypnosis/email-editor/react';
import '@returnhypnosis/email-editor/styles.css';

function App() {
  const [template, setTemplate] = useState({
    version: '1.0',
    metadata: { subject: 'My Email' },
    sections: [],
  });

  return <EmailEditorReact value={template} onChange={setTemplate} />;
}
```

👉 **[See Full Quick Start Guide](docs/getting-started/quickstart.md)**

---

## 📦 Packages

| Package | Description |
|---------|-------------|
| `@returnhypnosis/email-editor` | Main package (public API + React wrapper) |
| `@returnhypnosis/email-editor-core` | Framework-agnostic core engine |
| `@returnhypnosis/email-editor-ui` | React UI components |
| `@returnhypnosis/email-editor-blocks` | Standard block library |

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────┐
│  Your App (Next.js, React, Vanilla JS)         │
└─────────────────┬───────────────────────────────┘
                  │ imports
┌─────────────────▼───────────────────────────────┐
│  @returnhypnosis/email-editor                   │
│  ├─ createEditor() - Vanilla JS API             │
│  └─ EmailEditorReact - React component          │
└─────────────────┬───────────────────────────────┘
                  │
        ┌─────────┴─────────┐
        │                   │
┌───────▼─────────┐  ┌──────▼──────────┐
│  email-editor-ui│  │email-editor-core│
│  - Canvas       │  │ - Schema        │
│  - Toolbar      │  │ - Registry      │
│  - Inspector    │  │ - Compiler      │
└─────────────────┘  │ - History       │
                     └─────────────────┘
```

---

## 🎨 Available Blocks

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

## 💻 Development

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

👉 **[Development Guide](docs/guides/development.md)**

---

## 📖 Documentation

- 📘 [Getting Started](docs/getting-started/integration.md) - Installation and basic usage
- 📗 [API Reference](docs/guides/api.md) - Complete API documentation
- 📕 [Development Guide](docs/guides/development.md) - Contributing and architecture
- 📙 [Installation](docs/getting-started/installation.md) - Setup instructions
- 📓 [Quick Start](docs/getting-started/quickstart.md) - 5-minute overview

---

## 🔧 Tech Stack

**Core**
- TypeScript (strict mode)
- Zod (schema validation)
- Immer (immutable state)
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

## 🎯 Why This Exists

**Problems with existing solutions:**
- GrapesJS: Complex, outdated UI, hard to customize
- Unlayer: Expensive, closed-source, limited control
- Building from scratch: Too time-consuming

**This editor provides:**
- ✅ Full control over UI/UX
- ✅ No vendor lock-in
- ✅ Extensible architecture
- ✅ Production-ready code
- ✅ Type-safe from the ground up

---

## 📄 License

MIT License - See LICENSE file for details

---

## 🤝 Contributing

Contributions welcome! See [docs/guides/development.md](docs/guides/development.md) for guidelines.

---

## 🌟 Made for ReTurn Hypnosis

Built with ❤️ to power beautiful email newsletters.

