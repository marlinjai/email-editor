---
name: Email Editor - Framer DnD + API Monetization
overview: "Complete email editor refactor: Zustand store with document/interaction/api slices, Framer-like 3-way drop intent with MJML-aware fallbacks, canvas direct manipulation (resize/border-radius handles), mj-group abstraction, and API monetization layer with tiered pricing. Target: developer-first npm package + hosted API, revenue in 3-6 months."
todos:
  - id: store-foundation
    content: Create Zustand store with document/interaction/api slices
    status: completed
  - id: history-middleware
    content: Migrate HistoryManager to Zustand middleware with Immer patches
    status: completed
  - id: validation-middleware
    content: Implement MJML constraint validation middleware with fallback logic
    status: completed
  - id: drop-intent-hook
    content: Create useDropIntent hook with magnet zone calculation
    status: completed
  - id: editor-actions-hook
    content: Create useEditorActions bridge hook for components
    status: completed
  - id: drop-indicators
    content: Update CanvasDropZones with 3-way visual indicators
    status: completed
  - id: layers-drop-intent
    content: Add drop intent detection to LayersPanel tree items
    status: completed
  - id: resize-handles
    content: Create ResizeHandle and BorderRadiusHandle components
    status: completed
  - id: selection-outline
    content: Add selection outline overlay system to PreviewFrame
    status: completed
  - id: preview-commit
    content: Implement preview-then-commit pattern for canvas manipulation
    status: completed
  - id: group-abstraction
    content: Add setMobileHorizontal action and hide group from Layers
    status: completed
  - id: inspector-toggle
    content: Add mobile layout toggle to section inspector
    status: completed
  - id: migrate-editor
    content: Migrate EmailEditor.tsx from useState to Zustand store
    status: completed
  - id: update-children
    content: Update Canvas, LayersPanel, PropertyInspector to use store
    status: completed
  - id: api-compile-endpoint
    content: Create POST /compile endpoint with MJML compilation
    status: completed
  - id: api-key-validation
    content: Implement API key validation and usage tracking
    status: completed
  - id: stripe-billing
    content: Integrate Stripe for tiered billing (Free/Pro/Scale)
    status: pending
  - id: watermark-free-tier
    content: Add watermark to HTML output for free tier compiles
    status: completed
  - id: client-api-integration
    content: Add apiKey and compileEndpoint props to EmailEditor
    status: completed
---

# Email Editor: Framer-like DnD + API Monetization

## Executive Summary

Transform the email editor into a monetizable developer tool with:

- **Framer-like UX**: 3-way drop intent, canvas handles, smooth interactions
- **Centralized state**: Zustand store with document/interaction/api separation
- **MJML correctness**: Validation middleware prevents invalid states
- **Developer-first monetization**: npm package + API with tiered pricing

**Timeline**: ~4 weeks to monetizable product**Target**: $5,000+ MRR by month 6---

## Progress Summary

### Completed (Phase A - Store Foundation)

1. **Zustand Store** - `packages/core/src/store/`

- `documentSlice.ts` - Template state with CRUD operations
- `interactionSlice.ts` - Drag, resize, selection state
- `apiSlice.ts` - API key and compile endpoint config

2. **History Middleware** - `packages/core/src/store/middleware/history.ts`

- Immer patches for efficient undo/redo
- Automatic tracking of document mutations
- Skip tracking for interaction state

3. **Validation Middleware** - `packages/core/src/store/middleware/validation.ts`

- MJML nesting rule enforcement
- Smart fallback computation for invalid drops
- Node type detection utilities

4. **useDropIntent Hook** - `packages/ui/src/hooks/useDropIntent.ts`

- Magnet zone calculation (25/50/25 split)
- Container detection for "inside" intent
- CSS indicator style generation

5. **useEditorActions Hook** - `packages/ui/src/hooks/useEditorActions.ts`

- Bridge between components and Zustand store
- Clean action interface for components

---

## Monetization Model

| Tier | Price | Limits | Features ||------|-------|--------|----------|| Free | $0 | 100 compiles/month | Watermark in HTML output || Pro | $29/mo | 10,000 compiles/month | No watermark, priority support || Scale | $99/mo | 100,000 compiles/month | Volume pricing, SLA |**What ships via npm (public):**

- React UI components (Canvas, Toolbar, Inspector, Layers)
- JSON schema and TypeScript types
- Block definitions
- Client-side preview (limited, for development)

**What runs on your API (protected, monetized):**

- MJML compiler (production compiles require API key)
- Template library (future)
- AI content generation (future)

---

## Remaining Work

### Phase B: Drop Intent UI (Next)

- Update CanvasDropZones with 3-way visual indicators
- Add drop intent detection to LayersPanel tree items

### Phase C: Canvas Direct Manipulation

- Create ResizeHandle and BorderRadiusHandle components
- Add selection outline overlay system
- Implement preview-then-commit pattern

### Phase D: mj-group Abstraction

- Add setMobileHorizontal action
- Hide group from Layers panel
- Add mobile layout toggle to section inspector

### Phase E: Store Migration

- Migrate EmailEditor.tsx from useState to Zustand
- Update Canvas, LayersPanel, PropertyInspector to use store

### Phase F: API Monetization (Last)

- Create POST /compile endpoint
- Implement API key validation and usage tracking
- Integrate Stripe billing
- Add watermark for free tier
- Add apiKey/compileEndpoint props to EmailEditor

---

## File Summary

### Created Files

| File | Purpose ||------|---------|| `packages/core/src/store/index.ts` | Store creation and exports || `packages/core/src/store/types.ts` | Type definitions for all slices || `packages/core/src/store/documentSlice.ts` | Template CRUD operations || `packages/core/src/store/interactionSlice.ts` | UI state management || `packages/core/src/store/apiSlice.ts` | API configuration || `packages/core/src/store/middleware/history.ts` | Undo/redo with Immer || `packages/core/src/store/middleware/validation.ts` | MJML constraint checks || `packages/core/src/store/middleware/index.ts` | Middleware exports || `packages/ui/src/hooks/useDropIntent.ts` | Drop zone calculation || `packages/ui/src/hooks/useEditorActions.ts` | Store action bridge || `packages/ui/src/hooks/index.ts` | Hook exports |