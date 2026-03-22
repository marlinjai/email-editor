---
title: API Reference
description: Complete API documentation for the email editor
order: 5
summary: Complete API documentation for the email editor, covering the Editor layer, MobX State Tree models, block types, and MJML export functions.
type: documentation
tags: [email-editor, api-reference, mobx, mjml]
projects: [email-editor]
---

> **Note (2026-03-22):** Data Brain has been archived. `DataBrainTemplateAdapter`, `DataBrainContactAdapter`, `DataBrainCampaignAdapter`, `DataBrainAnalyticsAdapter`, `DataBrainAutomationAdapter`, and the `createDataBrainClient` factory documented below are deprecated.

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
  blocks?: BlockDefinition[];      // Custom blocks
  onChange?: (template: EmailTemplate) => void;
  onSave?: (template: EmailTemplate) => void;
}
```

#### Returns

```typescript
interface EditorInstance {
  getValue(): EmailTemplate;
  setValue(template: EmailTemplate): void;
  getHTML(): string;
  getMJML(): string;
  undo(): void;
  redo(): void;
  destroy(): void;
}
```

#### Example

```javascript
const editor = createEditor({
  container: document.getElementById('editor'),
  initialValue: myTemplate,
  onChange: (template) => {
    console.log('Changed:', template);
  },
});

// Get output
const html = editor.getHTML();
const mjml = editor.getMJML();

// Clean up
editor.destroy();
```

### EmailEditorReact Component

React wrapper for the editor.

#### Props

```typescript
interface EmailEditorReactProps {
  value: EmailTemplate;
  onChange: (template: EmailTemplate) => void;
  theme?: EditorTheme;
  blocks?: BlockDefinition[];
  onSave?: () => void;
}
```

#### Example

```tsx
<EmailEditorReact
  value={template}
  onChange={setTemplate}
  theme={customTheme}
  onSave={handleSave}
/>
```

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

## MJML Compiler

### createMJMLCompiler()

Create a compiler instance. **Server-side only** -- import from the `/server` entry point.

```typescript
import { createMJMLCompiler } from '@marlinjai/email-editor-core/server';

const compiler = createMJMLCompiler();
const result = compiler.compile(template);

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
    primary?: string;
    surface?: string;
    text?: string;
    border?: string;
  };
  fonts?: {
    heading?: string;
    body?: string;
  };
}
```

## Platform Package APIs

### @marlinjai/email-templates

| Export | Description |
|--------|-------------|
| `TemplateManager` | Template CRUD with versioning |
| `WorkspaceScopedTemplateManager` | Workspace-scoped template manager |
| `DataBrainTemplateAdapter` | Data Brain storage adapter |
| `TemplateDashboard` | React dashboard component |
| `TemplateCard` | React template card component |
| `TemplateVersionHistory` | React version history component |
| `CreateTemplateDialog` | React create dialog component |

### @marlinjai/email-contacts

| Export | Description |
|--------|-------------|
| `DataBrainContactAdapter` | Data Brain storage adapter |
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
| `DataBrainCampaignAdapter` | Data Brain storage adapter |
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
| `DataBrainAnalyticsAdapter` | Data Brain storage adapter |
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
| `DataBrainAutomationAdapter` | Data Brain storage adapter |
| `evaluateCondition` | Conditional step evaluation |
| `SequenceBuilder`, `AutomationList`, `EnrollmentStatusView` | React components |

### @email-editor/shared

| Export | Description |
|--------|-------------|
| `createDataBrainClient`, `createStorageBrainClient` | Client factories |
| `PlatformProvider`, `useDataBrain`, `useStorageBrain` | React context providers |
| `WorkspaceProvider`, `useWorkspace` | Workspace context |
| `AuthProvider`, `useAuth` | Auth context |
| `usePaginatedQuery` | Pagination hook |
| `bootstrapTables` | Database schema bootstrapper |
