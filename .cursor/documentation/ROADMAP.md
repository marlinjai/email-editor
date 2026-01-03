# Email Editor - High-Level Roadmap

**Project:** `@returnhypnosis/email-editor`  
**Type:** Embeddable email template authoring tool  
**Current Phase:** Phase 7 (Production Hardening) - In Progress

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

### ✅ Phase 1: Core Foundation (Completed)
- [x] Turborepo monorepo setup
- [x] TypeScript strict mode configuration
- [x] Core JSON schema with Zod validation
- [x] Block registry system
- [x] MJML compiler (JSON → MJML → HTML)
- [x] History manager (undo/redo with Immer)
- [x] Selection manager (track selected block/section)

### ✅ Phase 2: React UI Components (Completed)
- [x] Canvas component (iframe-based preview)
- [x] Block toolbar (draggable blocks)
- [x] Property inspector (Auto-generated forms)
- [x] Main editor layout (3-panel)

### ✅ Phase 3: Standard Blocks Library (Completed)
- [x] Text block (TipTap integration)
- [x] Image block
- [x] Button block
- [x] Divider block
- [x] Spacer block

### ✅ Phase 4: Public API & React Wrapper (Completed)
- [x] `createEditor()` factory function
- [x] `EmailEditorReact` component wrapper
- [x] Package configuration (NPM exports, tsup)

### ✅ Phase 5: Custom ReTurn Blocks (Completed)
- [x] Branded header block
- [x] Branded footer block
- [x] ReTurn theme configuration

### ✅ Phase 6: Documentation & Examples (Completed)
- [x] README.md (installation, quick start)
- [x] API documentation
- [x] Integration guide (Next.js example)

### 🔄 Phase 7: Production Hardening (In Progress)
- [ ] Error handling & validation
- [ ] Performance optimization
- [ ] Accessibility (WCAG 2.1 AA)
- [ ] Unit tests (80%+ coverage)
- [ ] E2E tests (Playwright)
- [ ] CI/CD pipeline (GitHub Actions)
- [ ] NPM publishing workflow

---

## Current Sprint

### This Week's Goals
1. [ ] Implement comprehensive unit tests for core & UI
2. [ ] Performance: Debounce MJML compilation
3. [ ] Accessibility review of Radix UI components

### Next steps
- Start unit testing with Vitest

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
**Next review:** 2026-01-10
