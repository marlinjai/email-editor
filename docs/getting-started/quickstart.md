# Quick Start Guide

## Installation & Setup

```bash
# Install dependencies
npm install

# Build all packages
npm run build

# Start example app
cd examples/nextjs
npm run dev
```

Open http://localhost:3000 to see the editor in action.

## What You Get

✅ **Core Engine** - Framework-agnostic email template management  
✅ **React UI** - Beautiful 3-panel editor interface  
✅ **Standard Blocks** - Text, Image, Button, Divider, Spacer  
✅ **Branded Blocks** - ReTurn Header & Footer (locked)  
✅ **MJML Compilation** - Server-side rendering to email-safe HTML  
✅ **Undo/Redo** - Full history management with Immer  
✅ **Drag & Drop** - Intuitive block placement with dnd-kit  
✅ **Device Preview** - Desktop and mobile views  
✅ **Theming** - Customizable colors and fonts  
✅ **Type Safe** - Full TypeScript support

## Next Steps

1. **Try the Example**
   ```bash
   cd examples/nextjs
   npm run dev
   ```

2. **Read the Docs**
   - [Getting Started](docs/GETTING_STARTED.md)
   - [API Reference](docs/API.md)
   - [Development Guide](DEVELOPMENT.md)

3. **Integrate into Your App**
   ```bash
   npm install @returnhypnosis/email-editor
   ```

   ```tsx
   import { EmailEditorReact } from '@returnhypnosis/email-editor/react';
   import '@returnhypnosis/email-editor/styles.css';

   function App() {
     const [template, setTemplate] = useState(/* ... */);
     return <EmailEditorReact value={template} onChange={setTemplate} />;
   }
   ```

## Project Structure

```
email-editor/
├── packages/
│   ├── core/          # JSON schema, MJML compiler, state management
│   ├── ui/            # React components (Canvas, Toolbar, Inspector)
│   ├── blocks/        # Standard block library
│   └── editor/        # Public API (createEditor, EmailEditorReact)
├── examples/
│   └── nextjs/        # Working Next.js integration
└── docs/              # Documentation
```

## Key Features

### 1. Clean Architecture

- **Core** is framework-agnostic
- **UI** is pure React components
- **Blocks** are pluggable and extensible
- **Editor** is the public-facing API

### 2. Type-Safe Schema

All templates are validated with Zod schemas. Invalid data is caught early.

### 3. MJML Compilation

Templates compile to MJML, then to email-safe HTML that works across all clients.

### 4. Immutable State

All state updates use Immer for clean, bug-free undo/redo.

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
Run `npm install` from the monorepo root.

**Import errors?**  
Run `npm run build` to compile all packages.

**Styles not loading?**  
Import `@returnhypnosis/email-editor/styles.css` in your app.

## Support

- 📖 [Full Documentation](docs/GETTING_STARTED.md)
- 💻 [Example App](examples/nextjs)
- 🐛 Issues? Check [DEVELOPMENT.md](DEVELOPMENT.md)

