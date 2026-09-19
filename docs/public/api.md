---
title: API Reference
description: Complete API documentation for the email editor
order: 5
summary: Complete API documentation for the email editor, covering the Editor layer, MobX State Tree models, block types, and MJML export functions.
type: documentation
tags: [email-editor, api-reference, mobx, mjml]
projects: [email-editor]
---

> **Note (2026-03-22):** Data Brain has been archived. Platform adapters now consume the `DatabaseAdapter` interface from `@marlinjai/data-table-core`. Use `@marlinjai/data-table-adapter-d1` (Cloudflare D1) or `@marlinjai/data-table-adapter-prisma` (PostgreSQL) as the concrete adapter. The legacy `DataBrain*Adapter` classes and the `createDataBrainClient` factory are deprecated.

# API Reference

## Editor Layer

### createEditor(options)

Create an email editor instance (framework-agnostic).

#### Parameters

```typescript
interface EditorOptions {
  container: HTMLElement;          // DOM element to mount editor
  initialValue?: EmailTemplate;    // Starting template
  theme?: EditorTheme;             // Custom theme
  blocks?: BlockDefinition[];      // Redefine standard block types; new types are refused
  onChange?: (template: EmailTemplate) => void;
  onSave?: (template: EmailTemplate) => void;    // Receives the current template
  onRequestImage?: OnRequestImage;               // Your image picker, see below
}
```

`createEditor` still needs `react` and `react-dom` installed (the editor is built with React), but your app does not have to use React. Import `@marlinjai/email-editor/styles.css` once.

#### Returns

```typescript
interface EditorInstance {
  getValue(): EmailTemplate;              // The latest document
  setValue(template: EmailTemplate): void;
  getHTML(): string;                      // Placeholder: returns '' (compile on the server)
  getMJML(): string;                      // Placeholder: returns '' (compile on the server)
  undo(): void;                           // Not implemented yet: use the toolbar or Cmd/Ctrl+Z
  redo(): void;                           // Not implemented yet: use the toolbar or Cmd/Ctrl+Shift+Z
  destroy(): void;                        // Unmounts the editor
}
```

#### Example

```javascript
import { createEditor } from '@marlinjai/email-editor';
import '@marlinjai/email-editor/styles.css';

const editor = createEditor({
  container: document.getElementById('editor'),
  initialValue: myTemplate,
  onChange: (template) => {
    console.log('Changed:', template);
  },
  theme: { colors: { primary: '#0f766e' } },
});

// Latest document, to send to your server for compilation
const doc = editor.getValue();

// Clean up
editor.destroy();
```

### EmailEditorReact Component

React wrapper for the editor, imported from `@marlinjai/email-editor/react`. It is uncontrolled: `initialTemplate` is read once, on mount. To load a different document, remount it with a new `key`.

#### Props

```typescript
interface EmailEditorReactProps {
  initialTemplate?: TemplateSnapshotIn;                 // Document to open; omit for an empty email
  onChange?: (template: TemplateSnapshotOut) => void;   // Whole document after edits, debounced by 300 ms
  onSave?: () => void;                                  // Shows a Save button in the toolbar
  onExport?: (template: TemplateSnapshotOut) => void;   // Shows an Export button; compile on your server
  onNavigateBack?: () => void;                          // Shows a back arrow in the toolbar
  onRequestImage?: OnRequestImage;                      // Your image picker, see below
  blocks?: BlockDefinition[];                           // Extra block types next to the standard ones
  theme?: EditorTheme;                                  // Brand colors and font of the editor chrome
}
```

#### Example

```tsx
'use client';

import { useState } from 'react';
import { EmailEditorReact, type TemplateSnapshotOut } from '@marlinjai/email-editor/react';
import '@marlinjai/email-editor/styles.css';

function Composer({ initial }: { initial?: TemplateSnapshotOut }) {
  const [doc, setDoc] = useState(initial);

  // The editor fills its container, so the container needs a height.
  return (
    <div style={{ height: '80vh' }}>
      <EmailEditorReact
        initialTemplate={initial}
        onChange={setDoc}
        theme={customTheme}
        onSave={() => handleSave(doc)}
      />
    </div>
  );
}
```

In Next.js, load the component with `next/dynamic` and `ssr: false` from a `'use client'` file, and set `serverExternalPackages: ['mjml', 'mjml-core', 'mjml-parser-xml', 'mjml-preset-core', 'mjml-validator']` in `next.config.ts`; `transpilePackages` is not needed. See the [Integration](./integration) guide.

### onRequestImage

```typescript
type OnRequestImage = (request: ImageRequest) => Promise<RequestedImage | null>;

interface ImageRequest {
  blockId: string;       // The block the image is for
  blockType: string;     // The block type asking (today always 'image')
  currentUrl?: string;
  currentAlt?: string;
}

interface RequestedImage {
  url: string;           // Must be publicly reachable by recipients' mail clients
  alt?: string;
}
```

Without the hook, the image block's inspector shows a plain URL field. With it, the inspector shows a Choose image button that calls your function. Resolve with `null` to cancel, or reject to show the error message inline. The full behavior is documented in `packages/editor/README.md`.

## Core Types

### EmailTemplate

```typescript
interface EmailTemplate {
  version: '1.0';
  metadata: TemplateMetadata;
  sections: Section[];
}

interface TemplateMetadata {
  subject?: string;
  previewText?: string;
  title?: string;
  createdAt?: string;
  updatedAt?: string;
  fonts?: FontDefinition[];
  themeColors?: ThemeColor[];
  breakpoint?: string;
  customCSS?: string;
  inlineCSS?: string;
}
```

### Section

```typescript
interface Section {
  id: string;
  type: 'section';
  backgroundColor?: string;
  backgroundImage?: string;
  backgroundPosition?: string;
  backgroundRepeat?: 'repeat' | 'no-repeat';
  backgroundSize?: string;
  fullWidth?: boolean;
  isWrapper?: boolean;
  noStack?: boolean;
  hidden?: boolean;
  padding?: Spacing;
  columns: Column[];
}
```

### Column

```typescript
interface Column {
  id: string;
  width?: number; // Percentage
  blocks: Block[];
  hidden?: boolean;
  backgroundColor?: string;
  verticalAlign?: 'top' | 'middle' | 'bottom';
  padding?: Spacing;
}
```

### Block (Union Type)

The `Block` type is a discriminated union of all 14 block types:

```typescript
type Block =
  | TextBlock
  | ImageBlock
  | ButtonBlock
  | DividerBlock
  | SpacerBlock
  | HeaderBlock
  | FooterBlock
  | SocialBlock
  | HeroBlock
  | AccordionBlock
  | RawBlock
  | NavbarBlock
  | CarouselBlock
  | TableBlock;
```

#### TextBlock

```typescript
interface TextBlock extends BaseBlock {
  type: 'text';
  content: string;       // HTML string from TipTap
  align?: 'left' | 'center' | 'right' | 'justify';
  color?: string;
  fontSize?: string;
  fontFamily?: string;
  padding?: Spacing;
  lineHeight?: string;
}
```

#### ImageBlock

```typescript
interface ImageBlock extends BaseBlock {
  type: 'image';
  src: string;
  alt?: string;
  width?: string;
  height?: string;
  align?: 'left' | 'center' | 'right';
  href?: string;
  padding?: Spacing;
  borderRadius?: string;
}
```

The host can supply `src` and `alt` from its own image picker through [`onRequestImage`](#onrequestimage).

#### ButtonBlock

```typescript
interface ButtonBlock extends BaseBlock {
  type: 'button';
  label: string;
  href: string;
  align?: 'left' | 'center' | 'right';
  backgroundColor?: string;
  color?: string;
  borderRadius?: string;
  border?: string;
  padding?: Spacing;
  innerPadding?: string;
}
```

#### SocialBlock

```typescript
interface SocialBlock extends BaseBlock {
  type: 'social';
  links: SocialLink[];
  iconSize?: string;
  iconPadding?: string;
  borderRadius?: string;
  align?: 'left' | 'center' | 'right';
  mode?: 'horizontal' | 'vertical';
}
```

#### HeroBlock

```typescript
interface HeroBlock extends BaseBlock {
  type: 'hero';
  backgroundImage: string;
  backgroundHeight?: string;
  backgroundWidth?: string;
  backgroundColor?: string;
  verticalAlign?: 'top' | 'middle' | 'bottom';
  mode?: 'fixed-height' | 'fluid-height';
}
```

#### AccordionBlock

```typescript
interface AccordionBlock extends BaseBlock {
  type: 'accordion';
  items: AccordionItem[];
  iconPosition?: 'left' | 'right';
  borderColor?: string;
  fontFamily?: string;
}
```

#### NavbarBlock

```typescript
interface NavbarBlock extends BaseBlock {
  type: 'navbar';
  links: NavbarLink[];
  hamburger?: boolean;
  baseUrl?: string;
  align?: 'left' | 'center' | 'right';
  icoColor?: string;
  padding?: Spacing;
}
```

#### CarouselBlock

```typescript
interface CarouselBlock extends BaseBlock {
  type: 'carousel';
  images: CarouselImage[];
  thumbnails?: 'visible' | 'hidden';
  borderRadius?: string;
  iconWidth?: string;
  tbBorderRadius?: string;
  padding?: Spacing;
}
```

#### TableBlock

```typescript
interface TableBlock extends BaseBlock {
  type: 'table';
  headers: string[];
  rows: string[][];
  align?: 'left' | 'center' | 'right';
  color?: string;
  fontFamily?: string;
  fontSize?: string;
  cellpadding?: string;
  cellspacing?: string;
  border?: string;
  padding?: Spacing;
}
```

#### DividerBlock, SpacerBlock, RawBlock, HeaderBlock, FooterBlock

```typescript
interface DividerBlock extends BaseBlock {
  type: 'divider';
  borderColor?: string;
  borderWidth?: string;
  borderStyle?: 'solid' | 'dashed' | 'dotted';
  width?: string;
  padding?: Spacing;
}

interface SpacerBlock extends BaseBlock {
  type: 'spacer';
  height: string;
}

interface RawBlock extends BaseBlock {
  type: 'raw';
  html: string;
}

interface HeaderBlock extends BaseBlock {
  type: 'header';
  locked: true;
}

interface FooterBlock extends BaseBlock {
  type: 'footer';
  locked: true;
}
```

## Block Registry

### createStandardBlockRegistry()

Creates a registry with all 14 standard blocks pre-registered.

```typescript
import { createStandardBlockRegistry } from '@marlinjai/email-editor-blocks';

const registry = createStandardBlockRegistry();
```

### BlockDefinition

```typescript
interface BlockDefinition<T extends Block = Block> {
  type: string;
  label: string;
  category: 'text' | 'media' | 'layout' | 'brand';
  icon?: string;
  description?: string;
  locked?: boolean;
  defaultProps: Omit<T, 'id' | 'type'>;
  propSchema: ZodType<Omit<T, 'id' | 'type'>>;
  toMJML: (block: T) => string;
}
```

### createStandardPrebuiltRegistry()

Creates a registry with all 35 prebuilt section templates.

```typescript
import { createStandardPrebuiltRegistry } from '@marlinjai/email-editor-blocks';

const prebuiltRegistry = createStandardPrebuiltRegistry();
```

## Document Validation

### migrateTemplate(doc)

Validates a stored or incoming document and returns it at the current schema version. Import it from `@marlinjai/email-editor-core`. Every document carries a schema `version` (today `"1.0"`, exported as `CURRENT_TEMPLATE_VERSION`); for `1.0` it returns the same object, validated. Run documents through it before compiling and when loading them from storage.

```typescript
import { migrateTemplate, isTemplateMigrationError } from '@marlinjai/email-editor-core';

try {
  const doc = migrateTemplate(input);
} catch (error) {
  if (isTemplateMigrationError(error)) {
    console.error(error.code, error.message, error.issues);
  }
}
```

It throws a `TemplateMigrationError` whose `code` is one of:

| `code` | Meaning |
|--------|---------|
| `INVALID_INPUT` | Not an object, so not a document. |
| `MISSING_VERSION` | No `version` string. |
| `UNSUPPORTED_VERSION` | Malformed version, or an older one with no migration. |
| `NEWER_VERSION` | Written by a newer editor. Upgrade these packages to open it. |
| `INVALID_DOCUMENT` | The version is known but the document fails its schema; `issues` lists where. |

## MJML Compiler

### createMJMLCompiler()

Create a compiler instance for MJML (Mailjet Markup Language). **Server-side only** -- import from the `/server` entry point, never from client code. Validate the document with `migrateTemplate` first.

```typescript
import { migrateTemplate } from '@marlinjai/email-editor-core';
import { createMJMLCompiler } from '@marlinjai/email-editor-core/server';

const compiler = createMJMLCompiler();
const result = compiler.compile(migrateTemplate(template));

console.log(result.html);   // Compiled HTML
console.log(result.mjml);   // MJML source
console.log(result.errors); // Validation errors (if any)
```

### MJMLExporter

Alternative MST-aware exporter for use with the store.

```typescript
import { MJMLExporter, createMJMLExporter } from '@marlinjai/email-editor-core/server';

const exporter = createMJMLExporter();
const { html, mjml, errors } = exporter.export(template);
```

## MST Store

### createRootStore(config)

Create the MobX State Tree root store.

```typescript
import { createRootStore } from '@marlinjai/email-editor-core';

const store = createRootStore({
  template: myTemplate,
  onChange: (snapshot) => saveToDatabase(snapshot),
});

// Direct MST operations
store.template.addSection(sectionData);
store.template.findBlockById('block-1')?.updateStyle('color', 'red');
```

## EditorTheme

```typescript
interface EditorTheme {
  colors?: {
    primary?: string;       // --ee-accent: primary buttons, selection, focus rings
    primaryHover?: string;  // --ee-accent-hover
    surface?: string;       // --ee-canvas-2: light panel surfaces
    text?: string;          // --ee-text-dark: text on light surfaces
    border?: string;        // --ee-border-light: borders on light surfaces
  };
  fonts?: {
    body?: string;          // --ee-font-sans: font stack of the editor chrome
  };
}
```

Each value sets one design token on the editor's root element (`.ee-root`) only. Any `--ee-*` token can also be overridden on `.ee-root` in your own CSS, outside any `@layer`. The stylesheet (`@marlinjai/email-editor/styles.css`) is scoped under `.ee-root` and safe beside Tailwind CSS 4, with no Tailwind configuration change.

## Platform Package APIs

### @marlinjai/email-templates

| Export | Description |
|--------|-------------|
| `TemplateManager` | Template CRUD with versioning |
| `WorkspaceScopedTemplateManager` | Workspace-scoped template manager |
| `createTemplateAdapter` | Factory that wraps a `DatabaseAdapter` from `@marlinjai/data-table-core` |
| `TemplateDashboard` | React dashboard component |
| `TemplateCard` | React template card component |
| `TemplateVersionHistory` | React version history component |
| `CreateTemplateDialog` | React create dialog component |

### @marlinjai/email-contacts

| Export | Description |
|--------|-------------|
| `createContactAdapter` | Factory that wraps a `DatabaseAdapter` from `@marlinjai/data-table-core` |
| `WorkspaceScopedContactManager` | Workspace-scoped contact manager |
| `parseCSV`, `importCSV` | CSV import utilities |
| `resolveMergeFields`, `extractMergeFields` | Merge field processing |
| `evaluateRule`, `evaluateSegmentGroup` | Segment evaluation |
| `generateUnsubscribeUrl`, `processUnsubscribe` | Unsubscribe handling |
| `generateListUnsubscribeHeaders` | RFC 8058 List-Unsubscribe headers |

### @marlinjai/email-campaigns

| Export | Description |
|--------|-------------|
| `CampaignManager` | Campaign CRUD, scheduling, sending |
| `createCampaignAdapter` | Factory that wraps a `DatabaseAdapter` from `@marlinjai/data-table-core` |
| `injectTrackingPixel` | Open tracking pixel injection |
| `rewriteLinksForTracking` | Click tracking link rewriting |
| `splitAudience`, `determineWinner` | A/B testing utilities |
| `getScheduledCampaignsReadyToSend` | Scheduler query |

### @marlinjai/email-send-adapter-resend

| Export | Description |
|--------|-------------|
| `ResendSendAdapter` | `SendAdapter` implementation for Resend |

### @marlinjai/email-analytics

| Export | Description |
|--------|-------------|
| `AnalyticsTracker` | Event recording and stats aggregation |
| `createAnalyticsAdapter` | Factory that wraps a `DatabaseAdapter` from `@marlinjai/data-table-core` |
| `handleOpenTrack`, `handleClickTrack` | Tracking endpoint handlers |
| `calculateEngagementScore`, `categorizeEngagement` | Engagement scoring |
| `generateHeatmapData`, `injectHeatmapOverlay` | Click heatmap generation |
| `compareCampaigns`, `getBestPerformer` | Campaign comparison |
| `exportStatsToCSV`, `exportEventsToCSV` | CSV export utilities |

### @marlinjai/email-teams

| Export | Description |
|--------|-------------|
| `WorkspaceManager` | Workspace and member management |
| `ApprovalManager` | Approval request workflows |
| `AuditLogger` | Audit log recording and querying |
| `BrandKitManager` | Brand colors, fonts, logos |
| `MemberList`, `ApprovalQueue`, `AuditLogViewer` | React components |
| `BrandKitEditor`, `WorkspaceSettings`, `WorkspaceSwitcher` | React components |

### @marlinjai/email-automation

| Export | Description |
|--------|-------------|
| `AutomationEngine` | Sequence execution engine |
| `createAutomationAdapter` | Factory that wraps a `DatabaseAdapter` from `@marlinjai/data-table-core` |
| `evaluateCondition` | Conditional step evaluation |
| `SequenceBuilder`, `AutomationList`, `EnrollmentStatusView` | React components |

### @email-editor/shared

Private, workspace-only package inside this monorepo; not published to npm.

| Export | Description |
|--------|-------------|
| `createStorageBrainClient` | Storage Brain client factory |
| `PlatformProvider`, `useDatabase`, `useStorageBrain` | React context providers (database is a `DatabaseAdapter` instance) |
| `WorkspaceProvider`, `useWorkspace` | Workspace context |
| `AuthProvider`, `useAuth` | Auth context |
| `usePaginatedQuery` | Pagination hook |
| `bootstrapTables` | Database schema bootstrapper |
