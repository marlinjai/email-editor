# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Install
pnpm install

# Build all packages (required before first dev run)
pnpm run build

# Watch mode for all packages in parallel
pnpm run dev

# Type check (this is the linter — no ESLint)
pnpm run lint

# Run all tests
pnpm run test

# Run a single test file
pnpm -F @marlinjai/email-editor-core run test -- src/schema/__tests__/validation.test.ts

# Run example app (localhost:3000)
pnpm -F email-editor-nextjs-example dev

# Clean dist/ and node_modules
pnpm run clean
```

To target a specific package for any command: `pnpm -F <package-name> <command>`.

## Architecture

This is a **pnpm + Turborepo monorepo** with packages grouped into three layers:

### Layer 1: Editor (Public API)
- **`@marlinjai/email-editor`** (`packages/editor/`) — Entry point for consumers. Exposes `createEditor()` (vanilla JS factory) and `EmailEditorReact` (React component). Also bundles CSS from the UI package.

### Layer 2: Core Packages
- **`@marlinjai/email-editor-core`** (`packages/core/`) — Framework-agnostic engine. Contains the MobX State Tree (MST) store, Zod schema/types, block registry system, and the MJML compiler. Has **two entry points**: the default (client-safe) and `/server` (Node.js only, exports the MJML compiler). Never import `core/server` from a browser bundle.
- **`@marlinjai/email-editor-ui`** (`packages/ui/`) — React UI layer. 3-panel layout: Toolbar | Canvas | Inspector. Uses dnd-kit for drag-and-drop, TipTap for rich text editing, Radix UI for primitives, and MobX React bindings for reactivity. Also owns the Tailwind CSS build (`styles.css`).
- **`@marlinjai/email-editor-blocks`** (`packages/blocks/`) — 14 standard block types (Text, Image, Button, Divider, Spacer, Social, Hero, Accordion, Raw, Navbar, Carousel, Table, Header, Footer). Exports `createStandardBlockRegistry()`.

### Layer 3: Platform Feature Packages
Build on top of the editor and core. Each is independently importable:
- **`@marlinjai/email-templates`** — Template CRUD, versioning, import/export, dashboard UI.
- **`@marlinjai/email-contacts`** — Contact lists, CSV import, segmentation, merge fields.
- **`@marlinjai/email-campaigns`** — Campaign builder, scheduling, A/B testing. Depends on contacts + templates.
- **`@marlinjai/email-automation`** — Trigger-based sequences and conditional logic. Depends on campaigns.
- **`@marlinjai/email-analytics`** — Open/click/bounce tracking, heatmaps, CSV export. Depends on campaigns.
- **`@marlinjai/email-teams`** — Workspaces, roles, approval workflows, brand kit, template locking.
- **`@marlinjai/email-send-adapter-resend`** — Resend API send adapter.

## Key Abstractions

### Template Data Model (MST)
The document tree is:
```
Template → sections[] → columns[] → blocks[]
```
`TemplateModel` in `packages/core/src/store/mst/models/` is the authoritative source of truth. `EditorUIStore` holds ephemeral UI state (selection, drag, preview device) and is intentionally excluded from undo/redo history.

### Block Registry
`BlockDefinition` (in `packages/core/src/registry/types.ts`) is the contract every block must implement:
- Type metadata (label, category, icon)
- Default props factory
- Zod validation schema
- MJML compiler function

Register blocks via `BlockRegistry.register()`. `createStandardBlockRegistry()` from the blocks package registers all 14 built-in types. Custom blocks follow the same interface.

### Client/Server Split
The MJML compiler lives only in `core/server`. The client bundle must never include it (mjml is a heavy Node.js-only dependency). Template compilation always happens server-side. The pattern in consuming apps:
```ts
// Client
import { createEditor } from '@marlinjai/email-editor';
// Server (API route, server action, etc.)
import { MJMLCompiler } from '@marlinjai/email-editor-core/server';
```

### Data Flow
User action in UI → MST action → MobX observer re-renders → `onChange` callback fires (debounced 300 ms) with updated template snapshot → caller persists to DB.

### DatabaseAdapter Pattern
Platform packages (templates, contacts, campaigns) use an abstract `DatabaseAdapter` interface so callers provide their own storage backend. There is no hard dependency on a specific database or ORM.

## Build System Details

Each package uses **tsup** to output dual CJS + ESM bundles with `.d.ts` declarations. Turborepo orchestrates build order via `dependsOn: ["^build"]` — upstream packages always build first. The UI package runs an extra `tailwindcss` step after tsup to emit `styles.css`, which the editor package then copies into its own `dist/`.
