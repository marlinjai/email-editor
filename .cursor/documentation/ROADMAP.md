# Email Editor - High-Level Roadmap

**Project:** `@returnhypnosis/email-editor`  
**Type:** Embeddable email template authoring tool  
**Current Phase:** Phase 1 (Core Foundation) - In Progress

---

## Vision Statement

Build a standalone, pluggable email editor that:
- Uses MJML for email-safe rendering
- Provides clean React UI (not GrapesJS/Unlayer)
- Works as an embeddable npm package
- Supports custom branded blocks
- Integrates with any email provider via adapters (Resend, SendGrid, SES)

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                    Host Application                      │
│  (Your email platform / app using the editor)           │
│                                                          │
│  - Authentication & permissions                          │
│  - Template storage (DB/Git/S3)                         │
│  - Asset storage (S3/Cloudinary)                        │
│  - Audience/contact management                          │
│  - Campaign scheduling                                  │
│  - Email sending (Resend/SendGrid/SES)                 │
│  - Analytics & compliance                               │
└──────────────────┬──────────────────────────────────────┘
                   │
                   │ imports & configures
                   ▼
┌─────────────────────────────────────────────────────────┐
│        @returnhypnosis/email-editor (npm package)       │
│                                                          │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐        │
│  │   Core     │  │  UI Layer  │  │  Blocks    │        │
│  │            │  │            │  │            │        │
│  │ • Schema   │  │ • Canvas   │  │ • Text     │        │
│  │ • Registry │  │ • Toolbar  │  │ • Image    │        │
│  │ • Compiler │  │ • Inspector│  │ • Button   │        │
│  │ • History  │  │            │  │ • Custom   │        │
│  └────────────┘  └────────────┘  └────────────┘        │
│                                                          │
│  Public API: createEditor(config) → EmailEditor         │
└─────────────────────────────────────────────────────────┘
```

---

## Phase Breakdown

### ✅ Phase 0: Planning & Architecture (Completed)
- [x] Define boundary specification (editor vs host)
- [x] Choose tech stack
- [x] Design monorepo structure
- [x] Define JSON schema for templates
- [x] Document integration patterns

### 🔄 Phase 1: Core Foundation (In Progress)
**Timeline:** Week 1-2  
**Status:** 70% complete

#### Completed
- [x] Turborepo monorepo setup
- [x] TypeScript strict mode configuration
- [x] Core JSON schema with Zod validation
- [x] Block registry system
- [x] MJML compiler (JSON → MJML → HTML)
- [x] History manager (undo/redo with Immer)

#### In Progress
- [ ] UI package setup (React + Tailwind + Radix UI + dnd-kit)
  - **Blockers:** None
  - **Next steps:** Install dependencies, configure Tailwind

#### Remaining
- [ ] Selection manager (track selected block/section)
- [ ] Core unit tests (schema, compiler, history)

**Success Criteria:**
- Can define `EmailTemplate` JSON
- Can compile JSON → MJML → HTML
- Can undo/redo changes
- Core is framework-agnostic (no React dependencies)

---

### 📋 Phase 2: React UI Components
**Timeline:** Week 2-3  
**Status:** Not started

#### Tasks
- [ ] Canvas component (iframe-based preview)
  - [ ] Click-to-select blocks
  - [ ] Selection outline overlay
  - [ ] Device toggle (desktop/mobile)
- [ ] Block toolbar (draggable blocks)
  - [ ] Category grouping
  - [ ] Search/filter
  - [ ] Drag source (dnd-kit)
- [ ] Property inspector
  - [ ] Auto-generated forms from Zod schemas
  - [ ] Field components (text, color, alignment, spacing)
  - [ ] Real-time updates with debouncing
- [ ] Main editor layout
  - [ ] 3-panel layout (Toolbar | Canvas | Inspector)
  - [ ] Top toolbar (undo/redo, save, preview)
  - [ ] Keyboard shortcuts (Cmd+Z, Delete)

**Success Criteria:**
- Can drag blocks from toolbar to canvas
- Can click to select blocks
- Can edit properties in inspector
- Changes reflect in live preview

---

### 📦 Phase 3: Standard Blocks Library
**Timeline:** Week 3-4  
**Status:** Not started

#### Tasks
- [ ] Text block
  - [ ] TipTap integration for rich text
  - [ ] Support: bold, italic, underline, links, headings
  - [ ] Alignment, color, font size controls
  - [ ] Convert TipTap JSON → MJML `<mj-text>`
- [ ] Image block
  - [ ] URL input with preview
  - [ ] Alt text, width, alignment
  - [ ] Convert to `<mj-image>`
- [ ] Button block
  - [ ] Label, link, alignment
  - [ ] Colors, border radius
  - [ ] Convert to `<mj-button>`
- [ ] Divider block
  - [ ] Color, width options
  - [ ] Convert to `<mj-divider>`
- [ ] Spacer block
  - [ ] Height control
  - [ ] Convert to `<mj-spacer>`

**Success Criteria:**
- All 5 standard blocks compile to valid MJML
- Each block has working property inspector
- Preview matches final email output

---

### 🔌 Phase 4: Public API & React Wrapper
**Timeline:** Week 4  
**Status:** Not started

#### Tasks
- [ ] `createEditor()` factory function
  - [ ] Framework-agnostic API
  - [ ] Accept: `container`, `initialValue`, `theme`, `blocks`, callbacks
  - [ ] Return: instance with `getValue()`, `setValue()`, `export()`, etc.
- [ ] `EmailEditorReact` component wrapper
  - [ ] Props: `value`, `onChange`, `theme`, `blocks`
  - [ ] Handle React lifecycle & cleanup
- [ ] Host adapter interface
  - [ ] `uploadAsset()` hook
  - [ ] `sendTestEmail()` hook (optional)
  - [ ] `getMergeTags()` hook (optional)
  - [ ] `listAudiences()` hook (optional)
- [ ] Package configuration
  - [ ] NPM exports: `@returnhypnosis/email-editor`, `/react`
  - [ ] Peer dependencies (React, ReactDOM)
  - [ ] Production build with tsup

**Success Criteria:**
- Can import and use in vanilla JS
- Can import and use in React app
- Can provide custom adapters (upload, send)
- Package installs without errors

---

### 🎨 Phase 5: Custom ReTurn Blocks (Optional)
**Timeline:** Week 5  
**Status:** Not started

#### Tasks
- [ ] Branded header block
  - [ ] ReTurn logo
  - [ ] "Welcome to the ReTurn Newsletter" text
  - [ ] Locked (non-editable)
- [ ] Branded footer block
  - [ ] Social links
  - [ ] Unsubscribe link placeholder
  - [ ] Locked (non-editable)
- [ ] ReTurn theme configuration
  - [ ] Primary color: `#944923`
  - [ ] Font: Georgia, serif
  - [ ] Export as `returnTheme`

**Success Criteria:**
- Can add branded blocks to toolbar
- Blocks are locked (cannot be edited, only added/removed)
- Theme applies consistently across editor

---

### 📚 Phase 6: Documentation & Examples
**Timeline:** Week 5-6  
**Status:** Not started

#### Tasks
- [ ] README.md (installation, quick start)
- [ ] API documentation (TypeScript types + examples)
- [ ] Integration guide
  - [ ] Next.js example
  - [ ] React example
  - [ ] Vanilla JS example
- [ ] Resend adapter example
- [ ] Migration guide (from GrapesJS/Unlayer)
- [ ] Storybook for component development

**Success Criteria:**
- Anyone can install and integrate in <15 minutes
- Examples run without modification
- Types are fully documented

---

### 🚀 Phase 7: Production Hardening
**Timeline:** Week 6-7  
**Status:** Not started

#### Tasks
- [ ] Error handling & validation
- [ ] Performance optimization
  - [ ] Lazy load blocks
  - [ ] Debounce heavy operations
  - [ ] Virtual scrolling for large templates
- [ ] Accessibility (WCAG 2.1 AA)
- [ ] Unit tests (80%+ coverage)
- [ ] E2E tests (Playwright)
- [ ] CI/CD pipeline (GitHub Actions)
- [ ] NPM publishing workflow
- [ ] Versioning & changelog

**Success Criteria:**
- Passes all tests
- Loads in <2 seconds
- Works with screen readers
- Published to NPM

---

## Current Sprint (Week 1)

### This Week's Goals
1. ✅ Complete boundary specification
2. ✅ Set up documentation structure
3. 🔄 Complete UI package setup
4. 🔄 Build Canvas component (basic)
5. 🔄 Build Block toolbar (basic)

### Blockers
- None currently

### Next Week Preview
- Complete Canvas + Toolbar
- Start Property Inspector
- Build first block (Text)

---

## Dependency Graph

```
setup-repo
  ├── core-schema
  │     ├── block-registry
  │     └── property-inspector
  ├── mjml-compiler
  │     └── canvas-component
  ├── history-manager
  │     └── create-editor-api
  └── ui-setup
        ├── canvas-component
        ├── block-toolbar
        ├── property-inspector
        └── text-block-tiptap
              └── standard-blocks
                    └── branded-blocks

editor-layout
  ├── canvas-component
  ├── block-toolbar
  └── property-inspector

create-editor-api
  ├── editor-layout
  └── history-manager
        └── react-wrapper
              └── nextjs-example
```

---

## Tech Stack Summary

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Core** | TypeScript | Type safety |
| | Zod | Schema validation |
| | Immer | Immutable updates |
| | MJML | Email compilation |
| **UI** | React 18 | Component library |
| | Tailwind CSS | Styling |
| | Radix UI | Accessible components |
| | dnd-kit | Drag and drop |
| | TipTap | Rich text editing |
| **Build** | Turborepo | Monorepo management |
| | tsup | Package bundling |
| | Vitest | Unit testing |
| | Playwright | E2E testing |
| **Deploy** | NPM | Package registry |
| | GitHub Actions | CI/CD |

---

## Success Metrics

### MVP (Week 4)
- [ ] Can create email template with 5 block types
- [ ] Can export valid HTML that renders in Gmail/Outlook
- [ ] Can integrate into Next.js app in <30 lines of code
- [ ] Zero runtime errors in console

### v1.0 (Week 7)
- [ ] 80%+ test coverage
- [ ] <2s load time
- [ ] WCAG 2.1 AA compliant
- [ ] Published to NPM
- [ ] 3+ integration examples

### Future
- [ ] 100+ npm downloads/week
- [ ] Used in 3+ production apps
- [ ] Community contributions
- [ ] Potential open-source release

---

## Risk Register

| Risk | Impact | Mitigation |
|------|--------|-----------|
| MJML limitations | High | Test with complex layouts early |
| TipTap integration complexity | Medium | Start simple, add features incrementally |
| Package size too large | Medium | Code splitting, peer dependencies |
| Browser compatibility | Low | Transpile to ES2020, test in IE11 emulator |
| Breaking changes in dependencies | Low | Lock versions, automated dependency updates |

---

## Open Questions

- [ ] Do we need WYSIWYG editing (contenteditable) or inspector-only?
  - **Decision pending:** Start with inspector-only (simpler)
- [ ] Should MJML compilation run client-side or server-side?
  - **Decision:** Server-side (smaller bundle, better security)
- [ ] Do we support template versioning (Git-like)?
  - **Decision pending:** Hooks only, host implements
- [ ] What's the licensing model?
  - **Decision pending:** Private initially, consider open-source later

---

## Change Log

### 2026-01-03
- Created roadmap
- Defined 7 phases
- Documented current progress (Phase 1: 70%)
- Established success criteria

---

**Last updated:** 2026-01-03  
**Next review:** 2026-01-10 (end of Week 1)

