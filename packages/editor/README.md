# @marlinjai/email-editor

A visual, drag-and-drop email editor you embed in your own app. It produces a JSON document; your server compiles that document to email-safe HTML with MJML (the Mailjet Markup Language, a markup that compiles to HTML which renders consistently across mail clients).

- React component (`EmailEditorReact`) and a framework-agnostic factory (`createEditor`)
- 14 block types (text, image, button, hero, social, navbar, table and more) and 35 pre-built sections
- Your own image picker through the `onRequestImage` hook
- A prebuilt stylesheet scoped to the editor, safe beside Tailwind CSS 4 or any other host styles
- Server-side compilation through `@marlinjai/email-editor-core/server`

Peer ranges accept React 18 and 19; the integration is verified on React 19.2, Next.js 16.3 and Tailwind CSS 4. Node.js 20.19 or newer.

## Install

```bash
pnpm add @marlinjai/email-editor @marlinjai/email-editor-core react react-dom
```

`@marlinjai/email-editor-core` is only needed directly if you compile or validate documents on your server (you almost certainly do).

## Use it in React

```tsx
'use client';

import { useState } from 'react';
import { EmailEditorReact, type TemplateSnapshotOut } from '@marlinjai/email-editor/react';
import '@marlinjai/email-editor/styles.css';

export function Composer({ initial }: { initial?: TemplateSnapshotOut }) {
  const [doc, setDoc] = useState(initial);

  return (
    <div style={{ height: '80vh' }}>
      <EmailEditorReact initialTemplate={initial} onChange={setDoc} onSave={() => save(doc)} />
    </div>
  );
}
```

- The editor fills its container, so give the container a height.
- `initialTemplate` is read once, on mount (the editor is uncontrolled). To load a different document, remount it with a new `key`.
- `onChange` receives the full document, debounced by 300 ms. Persist it as JSON.
- A document's `id` is optional. When the document you pass has none, the editor assigns one on mount (on its own copy: your object is not changed), and every document it hands back (`onChange`, `onExport`) carries that id. Save what you are handed and the id stays stable from then on.

### Props

| Prop | Type | What it does |
|------|------|--------------|
| `initialTemplate` | `TemplateSnapshotIn` | Document to open. Omit for an empty email. |
| `onChange` | `(doc) => void` | Called with the whole document after edits (debounced). |
| `onSave` | `() => void` | Shows a Save button in the toolbar and calls this on click. |
| `onExport` | `(doc) => void` | Shows an Export button; compile the document on your server. |
| `onNavigateBack` | `() => void` | Shows a back arrow in the toolbar. |
| `onRequestImage` | `(request) => Promise<{ url, alt? } \| null>` | Your image picker, see below. |
| `blocks` | `BlockDefinition[]` | Redefine standard block types (label, icon, category, default props). A new block type is refused with an error. |
| `theme` | `EditorTheme` | Brand colors and font of the editor chrome, see below. |

## Next.js (App Router)

The editor runs in the browser only (drag and drop, rich text, MobX state), so load it on the client and skip server rendering:

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

`next.config.ts`:

```ts
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // MJML is Node-only and loads files at runtime: keep it out of the server bundle.
  serverExternalPackages: ['mjml', 'mjml-core', 'mjml-parser-xml', 'mjml-preset-core', 'mjml-validator'],
};

export default nextConfig;
```

`transpilePackages` is **not** needed: the packages ship compiled ESM and CommonJS. This setup is verified on Next.js 16.3 with React 19.2 and Tailwind CSS 4 by the repository's example app (`examples/nextjs`).

## Compile on the server

Compilation happens on your server, never in the browser (MJML is a large Node.js dependency). Validate the document first with `migrateTemplate`:

```ts
// app/api/compile/route.ts
import { migrateTemplate, isTemplateMigrationError } from '@marlinjai/email-editor-core';
import { createMJMLCompiler } from '@marlinjai/email-editor-core/server';

export async function POST(request: Request) {
  try {
    const doc = migrateTemplate(await request.json());
    // { webFonts: false } leaves out MJML's automatic Google Fonts imports
    // (for fonts such as Roboto or Lato), when your mails must load nothing
    // from third parties.
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

Never import `@marlinjai/email-editor-core/server` from client code.

## Export as MJML or HTML, import existing MJML

Both directions run on your server, next to the compiler, and never in the browser bundle.

**Export.** The same `compile` call gives both files: `mjml` is the MJML source of the document, `html` the finished mail. Serve whichever the person asked for as a download:

```ts
// app/api/export/route.ts
import { migrateTemplate } from '@marlinjai/email-editor-core';
import { createMJMLCompiler } from '@marlinjai/email-editor-core/server';

export async function POST(request: Request) {
  const format = new URL(request.url).searchParams.get('format') === 'mjml' ? 'mjml' : 'html';
  const { html, mjml, errors } = createMJMLCompiler().compile(migrateTemplate(await request.json()));
  return new Response(format === 'mjml' ? mjml : html, {
    headers: {
      'content-type': format === 'mjml' ? 'text/plain; charset=utf-8' : 'text/html; charset=utf-8',
      'content-disposition': `attachment; filename="email.${format}"`,
      // errors: MJML's validation messages, worth showing next to the download
    },
  });
}
```

The editor's `getHTML()` and `getMJML()` cannot compile in the browser; call your route with `getValue()` instead. The editor has no export button of its own on purpose: a download belongs in your app's chrome (where the Lumitra Mail dashboard puts its Export menu), and only your server can compile.

**Import.** `importMjml(source)` reads an MJML document into the editor's document model:

```ts
import { importMjml, isMjmlImportError } from '@marlinjai/email-editor-core/server';

try {
  const { document, warnings } = importMjml(mjmlSource);
  // `document` passed migrateTemplate: open it in the editor, or store it.
  // `warnings`: what could not become an editable block, with where and why.
} catch (error) {
  if (isMjmlImportError(error)) {
    // error.code: invalid_xml | not_mjml | include_not_supported | too_large | too_deep | too_many_elements | invalid_document
    // error.line, error.column: where, when it is one place
  }
  throw error;
}
```

What maps, and what does not:

- Every standard component with the attributes its block has becomes that block: text, image, button, divider, spacer, navbar, carousel, accordion, raw HTML, sections, wrappers around one section, columns and groups of columns. Attributes the block has no field for (a `css-class` your `mj-style` rules target, `font-weight`, `mj-class`, ...) are kept on the block and emitted again, and the document keeps its `mj-attributes`, so the mail compiles as the source did.
- The editor's own export imports back exactly, ids included.
- What the editor cannot hold as a block is compiled in place and kept as a Raw HTML block that renders exactly as before, with a `kept_as_html` warning carrying the MJML: an `mj-hero` with content, `mj-social` (the editor's Social block draws its own icons), a hand-written `mj-table`, a wrapper around several sections, a section with conditional comments between its columns.
- A component MJML does not know renders nothing in MJML either; its source is kept in a comment in a Raw block, with an `unknown_component` warning.
- `mj-include` is refused (`include_not_supported`): an import has no files next to it, and the importer never reads the disk.

Importing is synchronous and CPU-bound. Limits (`MAX_MJML_BYTES`, `MAX_MJML_DEPTH`, `MAX_MJML_ELEMENTS`) bound one call; for untrusted input run it off your request thread with a deadline, as the Lumitra Mail service does in its compile worker pool.

## Stored documents and `migrateTemplate`

Every document carries a schema `version` (today `"1.0"`, exported as `CURRENT_TEMPLATE_VERSION`). Run stored documents through `migrateTemplate(doc)` when you load them: it returns the document at the current version, and it is the identity for `1.0` (the same object comes back, validated). It throws a `TemplateMigrationError` whose `code` is one of:

| `code` | Meaning |
|--------|---------|
| `INVALID_INPUT` | Not an object, so not a document. |
| `MISSING_VERSION` | No `version` string. |
| `UNSUPPORTED_VERSION` | Malformed version, or an older one with no migration. |
| `NEWER_VERSION` | Written by a newer editor. Upgrade these packages to open it. |
| `INVALID_DOCUMENT` | The version is known but the document fails its schema; `issues` lists where. |

Store the version next to the document (for example a `schema_version` column), so you can find documents that need upgrading after a future schema change.

## Your own image picker: `onRequestImage`

Without the hook, the image block's inspector shows a plain URL field. With it, the inspector shows a Choose image (or Replace image) button that calls your function:

```tsx
<EmailEditorReact
  onRequestImage={async ({ blockId, currentUrl, currentAlt }) => {
    const picked = await openMyMediaLibrary({ currentUrl }); // your UI
    if (!picked) return null; // cancelled: the block is left unchanged
    return { url: picked.publicUrl, alt: picked.description };
  }}
/>
```

- Resolve with `{ url, alt? }` to set the image. `url` must be publicly reachable by your recipients' mail clients. `alt` is optional; without it the block keeps its alt text.
- Resolve with `null` to cancel. Nothing changes.
- Reject (throw) to show the error's message inline under the button, for example an upload that failed. The user can try again.
- While your promise is pending the button is disabled, so a second request cannot start. If the user deletes the block before you resolve, the result is dropped.

Use an in-page dialog for the picker, not `window.prompt`.

## Styles, Tailwind CSS 4 and theming

Import `@marlinjai/email-editor/styles.css` once. Every rule in it is scoped under the editor's root element (`.ee-root`), including its CSS reset, so it does not restyle your page, and its keyframes are prefixed `ee-`. It is deliberately not inside a CSS cascade layer, so a Tailwind CSS 4 host's own reset (in `@layer base`) cannot leak into the editor either. Nothing in your Tailwind configuration needs to change, and you should not add the editor's files to Tailwind's content sources.

Theme the editor chrome with the `theme` prop:

```tsx
<EmailEditorReact
  theme={{
    colors: { primary: '#0f766e', primaryHover: '#115e59', surface: '#ffffff', text: '#0f172a', border: '#e2e8f0' },
    fonts: { body: 'Inter, system-ui, sans-serif' },
  }}
/>
```

Each value sets a design token on the editor's root element only. For finer control, override any `--ee-*` token in your own CSS; put the rule outside any `@layer`, because the editor's unlayered stylesheet wins over layered rules:

```css
.ee-root {
  --ee-midnight-2: #0b1220; /* toolbar background */
}
```

The tokens are listed at the top of the stylesheet (`--ee-midnight-*` for the dark chrome, `--ee-canvas-*` for light surfaces, `--ee-text-*`, `--ee-border-*`, `--ee-accent*`, `--ee-success*`, `--ee-danger*`, `--ee-font-sans`).

## Without React: `createEditor`

```ts
import { createEditor } from '@marlinjai/email-editor';
import '@marlinjai/email-editor/styles.css';

const editor = createEditor({
  container: document.getElementById('editor')!,
  initialValue: storedDoc,
  onChange: (doc) => save(doc),
  onRequestImage: async () => ({ url: 'https://cdn.example.com/hero.png' }),
  theme: { colors: { primary: '#0f766e' } },
});

// load another document (the editor remounts on it; undo history starts over)
editor.setValue(otherDoc);

// the document as it stands, with its id
editor.getValue();

// later
editor.destroy();
```

`initialValue` and `setValue` accept a document without an `id`: the editor opens it on a copy with a fresh id, and `getValue`, `onChange` and `onSave` return that id from the start, before any edit.

`createEditor` still needs `react` and `react-dom` installed (the editor is built with React), but your app does not have to use React.

## Related packages

- `@marlinjai/email-editor-core`: document schema, `migrateTemplate`, store, and the server-side MJML compiler
- `@marlinjai/email-editor-blocks`: the standard blocks and pre-built sections
- `@marlinjai/email-editor-ui`: the React UI, for hosts that assemble the editor themselves

## License

MIT
