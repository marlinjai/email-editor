---
title: Email Editor Next.js Example
summary: Next.js 16, React 19 and Tailwind CSS 4 host of the prebuilt @marlinjai/email-editor, with the editor loaded client-side via next/dynamic, an in-page image picker answering onRequestImage, and /api/compile and /api/save routes that validate with migrateTemplate before server-side MJML compilation.
type: readme
tags: [email-editor, nextjs, example, integration]
date: 2026-02-10
---

# Email Editor - Next.js Example

This example shows how a real host app embeds `@marlinjai/email-editor`: a Next.js 16 app on React 19 with its own Tailwind CSS 4 design, hosting the prebuilt editor and its scoped stylesheet.

## Where it runs

Only locally now. `email-editor.lumitra.co`, where this demo used to be public,
permanently redirects (308) to `https://mail.lumitra.co/`, the landing page of
Lumitra Mail, the product the editor became. The redirect is the small Worker in
`redirect/` (script name `email-editor`, which owns the custom domain);
`pnpm -F email-editor-nextjs-example deploy` deploys it. The demo's own OpenNext
config is renamed `email-editor-demo` and carries no route, so building or
previewing it can never take the domain back.

## Features

- **Editor page** (`app/editor/page.tsx`): a `'use client'` page that loads `EmailEditorReact` with `next/dynamic` and `ssr: false`, imports `@marlinjai/email-editor/styles.css` once, and gives the editor a sized container. It wires `onChange`, `onSave`, `onExport`, `onNavigateBack`, `onRequestImage` and a `theme` that uses the app's font.
- **In-page image picker** (`app/editor/ImagePickerDialog.tsx`): a host-side dialog that answers the editor's `onRequestImage` hook with a sample image or a pasted URL, cancels with `null`, or rejects with a simulated upload failure so you can see the inline error.
- **Server compilation** (`app/api/compile/route.ts`): validates the document with `migrateTemplate` (answering 400, or 422 for a document from a newer editor), then compiles it with `createMJMLCompiler()` from `@marlinjai/email-editor-core/server` to MJML (Mailjet Markup Language) and HTML.
- **Save** (`app/api/save/route.ts`): validates with `migrateTemplate`, compiles, and in development writes the JSON and HTML to `saved-templates/`.
- **Tailwind CSS 4 beside the editor**: the editor's stylesheet is scoped under `.ee-root`, so the app's Tailwind styles and the editor do not restyle each other, and the Tailwind setup needs no editor-specific configuration.
- **`next.config.ts`**: `serverExternalPackages: ['mjml', 'mjml-core', 'mjml-parser-xml', 'mjml-preset-core', 'mjml-validator']`, and no `transpilePackages` (the packages ship compiled).
- A dashboard (`app/dashboard`) that exercises the platform packages (templates, contacts, campaigns, analytics, teams, automation).

## Getting Started

```bash
# From the monorepo root
pnpm install
pnpm run build

# Start the development server
pnpm -F email-editor-nextjs-example dev
```

Open [http://localhost:3000](http://localhost:3000) and go to `/editor` for the editor.

## Usage

### Loading the Editor

```tsx
'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import type { TemplateSnapshotIn, TemplateSnapshotOut } from '@marlinjai/email-editor/react';
import '@marlinjai/email-editor/styles.css';

const EmailEditorReact = dynamic(
  () => import('@marlinjai/email-editor/react').then((mod) => mod.EmailEditorReact),
  { ssr: false, loading: () => <p>Loading editor...</p> }
);

const initialTemplate: TemplateSnapshotIn = {
  id: 'default-template',
  version: '1.1',
  metadata: { title: 'Untitled Template', subject: 'Your Email Subject' },
  sections: [],
};

export default function EditorPage() {
  const [doc, setDoc] = useState<TemplateSnapshotOut | null>(null);

  // The editor fills its container, so the container needs a height.
  return (
    <div style={{ height: '100vh' }}>
      <EmailEditorReact
        initialTemplate={initialTemplate}
        onChange={setDoc}
        onSave={() =>
          fetch('/api/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(doc),
          })
        }
      />
    </div>
  );
}
```

The editor is uncontrolled: `initialTemplate` is read once on mount, and `onChange` receives the whole document, debounced by 300 ms.

### Image Picker

The page passes `onRequestImage` and resolves it from `ImagePickerDialog`, an in-page dialog, rather than `window.prompt`. The hook's full contract is in [`packages/editor/README.md`](../../packages/editor/README.md).

### Server-Side Compilation

The API route at `/api/compile` validates the document with `migrateTemplate` and compiles it to MJML and HTML on the server:

```typescript
const response = await fetch('/api/compile', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(doc),
});

const result = await response.json();
if (result.success) {
  const { mjml, html } = result;
} else {
  // result.code is set when migrateTemplate rejected the document
  console.error(result.error ?? result.errors);
}
```

## Theme Customization

The example sets only the editor's font. Every `theme` value sets an `--ee-*` design token on the editor's root element:

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
