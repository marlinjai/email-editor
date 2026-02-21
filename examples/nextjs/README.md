# Email Editor - Next.js Example

This example demonstrates how to integrate `@marlinjai/email-editor` into a Next.js application.

## Features

- React component integration with `EmailEditorReact`
- Server-side MJML compilation via API route
- Custom ReTurn theme configuration
- Save functionality with API endpoint

## Getting Started

```bash
# Install dependencies (from monorepo root)
npm install

# Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to see the editor.

## Usage

### Basic Integration

```tsx
import { EmailEditorReact } from '@marlinjai/email-editor/react';
import type { EmailTemplate } from '@marlinjai/email-editor';

export default function MyPage() {
  const [template, setTemplate] = useState<EmailTemplate>(/* ... */);

  return (
    <EmailEditorReact
      value={template}
      onChange={setTemplate}
      onSave={() => {
        // Handle save
      }}
    />
  );
}
```

### Server-Side Compilation

The example includes an API route at `/api/compile` that compiles EmailTemplate JSON to MJML and HTML on the server:

```typescript
const response = await fetch('/api/compile', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(template),
});

const { mjml, html } = await response.json();
```

## Theme Customization

Customize the editor's appearance:

```typescript
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

