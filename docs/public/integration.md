---
title: Integration
description: React and vanilla JS integration patterns
order: 4
---

# Getting Started with @marlinjai/email-editor

## Installation

```bash
npm install @marlinjai/email-editor
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

### Adding Blocks

Drag blocks from the left toolbar onto the canvas. Available blocks:

- **Text** - Rich text with formatting
- **Image** - Images with optional links
- **Button** - Call-to-action buttons
- **Divider** - Horizontal lines
- **Spacer** - Vertical spacing
- **ReTurn Header** - Branded header (locked)
- **ReTurn Footer** - Branded footer (locked)

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
import { createMJMLCompiler } from '@marlinjai/email-editor-core';

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

## Next Steps

- See the [Next.js example](../../examples/nextjs) for a complete integration
- Read the [API Reference](./api) for detailed documentation
- Check the [Architecture](./architecture) for design decisions
