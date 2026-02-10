---
title: Email Editor
description: Visual email template builder with MST state and MJML export
order: 0
---

# Email Editor

A visual drag-and-drop email template builder built on MobX State Tree with MJML export.

## Features

- **Core Engine** — Framework-agnostic email template management
- **React UI** — 3-panel editor interface
- **Standard Blocks** — Text, Image, Button, Divider, Spacer
- **MJML Compilation** — Server-side rendering to email-safe HTML
- **Undo/Redo** — Full history management
- **Drag & Drop** — Intuitive block placement
- **Device Preview** — Desktop and mobile views
- **Theming** — Customizable colors and fonts
- **Type Safe** — Full TypeScript support

## Quick Start

```bash
npm install @returnhypnosis/email-editor
```

```tsx
import { EmailEditorReact } from '@returnhypnosis/email-editor/react';
import '@returnhypnosis/email-editor/styles.css';

function App() {
  const [template, setTemplate] = useState(initialTemplate);
  return <EmailEditorReact value={template} onChange={setTemplate} />;
}
```

## Documentation

- [Architecture](/projects/email-editor/architecture) — Package layering, data flow, design decisions
- [Quick Start](/projects/email-editor/quickstart) — Installation and setup
- [Installation](/projects/email-editor/installation) — Detailed installation instructions
- [Integration](/projects/email-editor/integration) — React and vanilla JS integration patterns
- [API Reference](/projects/email-editor/api) — Full API documentation
- [Development](/projects/email-editor/development) — Development workflow and contributing
