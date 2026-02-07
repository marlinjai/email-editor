# Email Editor - High-Level Roadmap

**Project:** `@returnhypnosis/email-editor`  
**Type:** Embeddable email template authoring tool  
**Current Phase:** Phase 9 (Framer-like DnD UX) - In Progress

---

## Vision Statement

Build a standalone, pluggable email editor that:
- Uses MJML for email-safe rendering
- Provides clean React UI (not GrapesJS/Unlayer)
- Works as an embeddable npm package
- Supports custom branded blocks
- Integrates with any email provider via adapters (Resend, SendGrid, SES)
- Monetizable via API compile endpoint

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
│  │ • Store    │  │ • Layers   │  │ • Custom   │        │
│  │ • History  │  │ • Hooks    │  │            │        │
│  └────────────┘  └────────────┘  └────────────┘        │
│                                                          │
│  Public API: createEditor(config) → EmailEditor         │
└─────────────────────────────────────────────────────────┘
```

---

## Phase Breakdown

### Phase 0: Planning & Architecture (Completed)
- [x] Define boundary specification (editor vs host)
- [x] Choose tech stack
- [x] Design monorepo structure
- [x] Define JSON schema for templates
- [x] Document integration patterns

### Phase 1: Core Foundation (Completed)
- [x] Turborepo monorepo setup
- [x] TypeScript strict mode configuration
- [x] Core JSON schema with Zod validation
- [x] Block registry system
- [x] MJML compiler (JSON → MJML → HTML)
- [x] History manager (undo/redo with Immer)
- [x] Selection manager (track selected block/section)

### Phase 2: React UI Components (Completed)
- [x] Canvas component (iframe-based preview)
- [x] Block toolbar (draggable blocks)
- [x] Property inspector (Auto-generated forms)
- [x] Main editor layout (3-panel)

### Phase 3: Standard Blocks Library (Completed)
- [x] Text block (TipTap integration)
- [x] Image block
- [x] Button block
- [x] Divider block
- [x] Spacer block

### Phase 4: Public API & React Wrapper (Completed)
- [x] `createEditor()` factory function
- [x] `EmailEditorReact` component wrapper
- [x] Package configuration (NPM exports, tsup)

### Phase 5: Custom ReTurn Blocks (Completed)
- [x] Branded header block
- [x] Branded footer block
- [x] ReTurn theme configuration

### Phase 6: Documentation & Examples (Completed)
- [x] README.md (installation, quick start)
- [x] API documentation
- [x] Integration guide (Next.js example)

### Phase 7: Production Hardening (Completed)
- [x] Error handling & validation
- [x] Performance optimization
- [x] Accessibility (WCAG 2.1 AA)
- [x] CI/CD pipeline (GitHub Actions)
- [ ] Unit tests (80%+ coverage) - deferred
- [ ] E2E tests (Playwright) - deferred

### Phase 8: Zustand Store Migration (Completed)
- [x] Create Zustand store with document/interaction/api slices
- [x] Implement history middleware with Immer patches
- [x] Implement validation middleware for MJML constraints
- [x] Create useDropIntent hook with magnet zones
- [x] Create useEditorActions bridge hook
- [x] Export store from core package
- [x] **Migrate EmailEditor.tsx to use Zustand store** (2026-01-04)

### Phase 9: Framer-like DnD UX (In Progress)
- [x] Add selection outline overlay system (SelectionOverlay.tsx)
- [x] Update CanvasDropZones with transparent overlays
- [x] Add drag handle to selected blocks
- [x] Implement block dragging from selection overlay
- [ ] Add 3-way drop intent indicators to LayersPanel
- [ ] Create ResizeHandle for images/buttons
- [ ] Create BorderRadiusHandle for buttons
- [ ] Implement preview-then-commit pattern for canvas manipulation
- [ ] Add setMobileHorizontal action and hide group from Layers
- [ ] Add mobile layout toggle to section inspector

### Phase 10: API Monetization (Planned)
- [ ] Create POST /compile endpoint with MJML compilation
- [ ] Implement API key validation and usage tracking
- [ ] Integrate Stripe for tiered billing (Free/Pro/Scale)
- [ ] Add watermark to HTML output for free tier compiles
- [ ] Add apiKey and compileEndpoint props to EmailEditor
- [ ] Build developer dashboard for API key management

---

## Current Sprint

### This Week's Goals
1. [x] Complete Zustand store foundation
2. [x] Implement history middleware
3. [x] Implement validation middleware
4. [x] Migrate EmailEditor.tsx to use Zustand store
5. [x] Redesign drop zones to be transparent (Framer-style)
6. [x] Create architecture documentation sub-files

### Next Steps
- Add resize handles for images/buttons
- Add border-radius handles
- Implement preview-then-commit pattern
- Complete Phase 9 remaining items
- Begin Phase 10 (API Monetization)

---

## Dependency Graph

```
setup-repo
  ├── core-schema
  │     ├── block-registry
  │     └── property-inspector
  ├── mjml-compiler
  │     └── canvas-component
  ├── zustand-store
  │     ├── document-slice
  │     ├── interaction-slice
  │     ├── api-slice
  │     ├── history-middleware
  │     └── validation-middleware
  └── ui-setup
        ├── canvas-component
        ├── block-toolbar
        ├── property-inspector
        ├── layers-panel
        └── hooks
              ├── useDropIntent
              └── useEditorActions
```

---

## Tech Stack Summary

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Core** | TypeScript | Type safety |
| | Zod | Schema validation |
| | Immer | Immutable updates |
| | Zustand | State management |
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

### MVP (Completed)
- [x] Can create email template with 5+ block types
- [x] Can export valid HTML that renders in Gmail/Outlook
- [x] Can integrate into Next.js app in <30 lines of code
- [x] Zero runtime errors in console

### v1.0 (Target: Month 2)
- [ ] Framer-like drag-and-drop UX
- [ ] Canvas direct manipulation (resize handles)
- [ ] <2s load time
- [ ] Published to NPM

### Monetization (Target: Month 3-6)
- [ ] API compile endpoint live
- [ ] Stripe billing integrated
- [ ] 10+ paying customers
- [ ] $1,000+ MRR

### Scale (Target: Month 6+)
- [ ] 100+ npm downloads/week
- [ ] $5,000+ MRR
- [ ] Used in 3+ production apps
- [ ] Community contributions

---

## Risk Register

| Risk | Impact | Mitigation |
|------|--------|-----------|
| MJML limitations | High | Test with complex layouts early |
| TipTap integration complexity | Medium | Start simple, add features incrementally |
| Package size too large | Medium | Code splitting, peer dependencies |
| Browser compatibility | Low | Transpile to ES2020 |
| API pricing wrong | Medium | Start with generous free tier |
| Breaking changes in dependencies | Low | Lock versions, automated dependency updates |

---

## Open Questions (Resolved)

- [x] Do we need WYSIWYG editing (contenteditable) or inspector-only?
  - **Decision:** Inspector-only for now, WYSIWYG planned for future
- [x] Should MJML compilation run client-side or server-side?
  - **Decision:** Server-side API for production (monetized), client preview for dev
- [x] Do we support template versioning (Git-like)?
  - **Decision:** Hooks only, host implements
- [x] What's the licensing model?
  - **Decision:** npm package free, API compilation monetized
- [x] What state management approach?
  - **Decision:** Zustand with document/interaction/api slices

---

## Change Log

### 2026-01-04 (Stabilization Sprint)
- **CRITICAL FIX:** Migrated EmailEditor.tsx from useState to Zustand store
  - Removed legacy createHistoryManager usage
  - All mutations now go through store actions
  - Undo/redo now uses store history middleware
- **Redesigned CanvasDropZones:** Now transparent (Framer-style)
  - Preview stays visible during drag
  - Thin insertion lines show drop position
  - No more opaque overlay hiding content
- **Created architecture documentation:**
  - `DND_ARCHITECTURE.md` - Drag-and-drop system deep dive
  - `CANVAS_RENDERING.md` - Preview system documentation
  - `STATE_FLOW.md` - Actual vs target state management
  - `STABILITY_CHECKLIST.md` - Pre-feature requirements

### 2026-01-04 (Earlier)
- Completed Phase 8 (Zustand Store Migration)
- Created document, interaction, and API slices
- Implemented history middleware with Immer patches
- Implemented validation middleware for MJML constraints
- Created useDropIntent and useEditorActions hooks
- Updated roadmap with new phases

### 2026-01-03
- Created roadmap
- Defined 7 phases
- Documented current progress
- Established success criteria

---

**Last updated:** 2026-01-04  
**Next review:** 2026-01-11
