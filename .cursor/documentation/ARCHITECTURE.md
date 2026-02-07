# Email Editor - Architecture Documentation

## Overview

The email editor is a Framer-like template authoring tool built on MJML. It uses a centralized Zustand store for state management, with middleware for undo/redo and MJML validation.

---

## Package Structure

```
packages/
├── core/           # Framework-agnostic engine
│   ├── schema/     # TypeScript types + Zod validation
│   ├── compiler/   # MJML → HTML compilation
│   ├── store/      # Zustand store + middleware
│   ├── registry/   # Block type registry
│   └── history/    # Legacy history manager (deprecated)
│
├── ui/             # React components
│   ├── canvas/     # Preview iframe + drop zones
│   ├── toolbar/    # Block dragging toolbar
│   ├── inspector/  # Property editing panel
│   ├── layers/     # Document tree panel
│   ├── sidebar/    # Tabbed sidebar container
│   └── hooks/      # React hooks (useDropIntent, useEditorActions)
│
├── blocks/         # Block definitions
│   ├── text/       # Rich text block
│   ├── image/      # Image block
│   ├── button/     # Button block
│   ├── divider/    # Divider block
│   ├── spacer/     # Spacer block
│   ├── branded/    # ReTurn branded blocks
│   └── prebuilt/   # Template snippets
│
└── editor/         # Public API package
    └── react.tsx   # EmailEditorReact component
```

---

## Zustand Store Architecture

The store has three slices, each with distinct responsibilities:

### Document Slice (`documentSlice.ts`)

**Purpose:** Authoritative template state and CRUD operations.

**State:**
```typescript
interface DocumentState {
  template: EmailTemplate;
  
  // Block operations
  insertBlock: (columnId: string, index: number, block: Block) => void;
  moveBlock: (blockId: string, targetColumnId: string, targetIndex: number) => void;
  updateBlock: (blockId: string, updates: Partial<Block>) => void;
  deleteBlock: (blockId: string) => void;
  
  // Section operations
  insertSection: (index: number, section: Section) => void;
  moveSection: (sectionId: string, targetIndex: number) => void;
  updateSection: (sectionId: string, updates: Partial<Section>) => void;
  deleteSection: (sectionId: string) => void;
  
  // Column operations
  updateColumn: (columnId: string, updates: Partial<Column>) => void;
  setColumnCount: (sectionId: string, count: number) => void;
  setMobileHorizontal: (sectionId: string, enabled: boolean) => void;
  
  // Metadata
  updateMetadata: (updates: Partial<TemplateMetadata>) => void;
  
  // History (connected to middleware)
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
  clearHistory: () => void;
}
```

**Key behaviors:**
- All mutations go through the history middleware
- Uses Immer for immutable updates
- `setMobileHorizontal()` controls the mj-group abstraction

### Interaction Slice (`interactionSlice.ts`)

**Purpose:** Ephemeral UI state that doesn't need persistence or undo.

**State:**
```typescript
interface InteractionState {
  // Selection
  selectedId: string | null;
  selectedType: 'block' | 'section' | 'column' | null;
  
  // Drag state
  dragState: {
    isDragging: boolean;
    draggedId: string | null;
    draggedType: 'block' | 'template' | null;
    dropIntent: DropIntent | null;
  };
  
  // Resize state
  resizeState: {
    isResizing: boolean;
    targetId: string | null;
    handleType: 'width' | 'height' | 'borderRadius' | null;
    previewValue: string | null;
  };
  
  // Actions
  setSelection: (id: string | null, type: SelectionType | null) => void;
  startDrag: (id: string, type: DraggedType) => void;
  updateDropIntent: (intent: DropIntent | null) => void;
  endDrag: () => void;
  startResize: (targetId: string, handleType: HandleType) => void;
  updateResizePreview: (value: string) => void;
  commitResize: () => void;
}
```

**Key behaviors:**
- High-frequency updates (drag, hover) don't affect document
- Preview-then-commit pattern for resize operations
- Changes here don't create history entries

### API Slice (`apiSlice.ts`)

**Purpose:** Configuration for compile API monetization.

**State:**
```typescript
interface APIState {
  apiKey: string | null;
  compileEndpoint: string;
  isPreviewMode: boolean;
  
  setApiKey: (key: string | null) => void;
  setCompileEndpoint: (endpoint: string) => void;
  setPreviewMode: (enabled: boolean) => void;
}
```

**Key behaviors:**
- Controls whether compilation goes to API or runs locally
- Preview mode allows client-side compilation for development

---

## Middleware

### History Middleware (`middleware/history.ts`)

**Purpose:** Automatic undo/redo tracking for document mutations.

**How it works:**
1. Wraps the `set` function for the document slice
2. Uses Immer's `produceWithPatches` to track changes
3. Stores forward and inverse patches
4. Provides `undo()` and `redo()` by applying inverse/forward patches

**Key decisions:**
- Only tracks document slice changes (not interaction or API)
- Uses patches instead of full snapshots for memory efficiency
- Debounces rapid changes (e.g., typing) to reduce history noise

### Validation Middleware (`middleware/validation.ts`)

**Purpose:** Enforce MJML nesting rules and provide smart fallbacks.

**MJML Rules:**
1. Sections can only exist at root level (inside mj-body)
2. Columns can only exist inside sections
3. Blocks can only exist inside columns
4. Sections cannot be nested inside columns
5. Columns cannot be nested inside other columns

**Fallback behavior:**
```typescript
// If user drops a block onto a section (invalid)
validateDropIntent(template, 'block', sectionId, 'inside')
// Returns: { isValid: false, fallback: { parentId: firstColumnId, index: 0 } }
```

**Key functions:**
```typescript
// Check if a drop is valid
validateDropIntent(template, dragType, targetId, zone): ValidationResult

// Get validated intent with automatic fallback
computeValidatedDropIntent(template, rawIntent): DropIntent

// Find nodes by ID
findSection(template, id): Section | null
findColumn(template, id): Column | null
findBlock(template, id): Block | null
getNodeType(template, id): 'section' | 'column' | 'block' | null
```

---

## mj-group Abstraction

**User-facing model:**
```
Template
└── Section
    └── Columns
        └── Blocks
```

**Internal model (when mobileHorizontal=true):**
```
Template
└── Section
    └── mj-group (hidden)
        └── Columns
            └── Blocks
```

**How it works:**
1. `Section` has a `noStack` property (controls stacking behavior)
2. `setMobileHorizontal(sectionId, true)` sets `noStack=true`
3. Compiler wraps columns in `<mj-group>` when `noStack=true`
4. LayersPanel never renders "group" nodes

**Why this matters:**
- Users think in terms of "Section → Columns"
- They don't need to understand MJML's mj-group semantics
- The abstraction handles complexity automatically

---

## Drop Intent System

**3-way drop zones:**
- `before` - Insert above target
- `after` - Insert below target
- `inside` - Insert as child of target (only valid for containers)

**Magnet zone calculation:**
```
┌────────────────────────────┐
│  Top 25%    → 'before'     │
├────────────────────────────┤
│  Middle 50% → 'inside'     │
│  (if container)            │
├────────────────────────────┤
│  Bottom 25% → 'after'      │
└────────────────────────────┘
```

**useDropIntent hook:**
```typescript
const { intent, isValid, fallback } = useDropIntent({
  hoveredId,
  pointerY,
  elementRect,
  template,
  draggedType,
});
```

---

## Component Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                         EmailEditor                              │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                    EditorStoreProvider                     │  │
│  │                                                            │  │
│  │  ┌──────────┐  ┌──────────────┐  ┌──────────────────────┐ │  │
│  │  │ Toolbar  │  │    Canvas    │  │     Inspector        │ │  │
│  │  │          │  │              │  │                      │ │  │
│  │  │ reads:   │  │ reads:       │  │ reads:               │ │  │
│  │  │ - blocks │  │ - template   │  │ - selectedId         │ │  │
│  │  │          │  │ - selection  │  │ - selectedType       │ │  │
│  │  │ writes:  │  │ - dragState  │  │ - block/section data │ │  │
│  │  │ - drag   │  │              │  │                      │ │  │
│  │  │   State  │  │ writes:      │  │ writes:              │ │  │
│  │  │          │  │ - selection  │  │ - updateBlock        │ │  │
│  │  │          │  │ - dropIntent │  │ - updateSection      │ │  │
│  │  │          │  │ - insert*    │  │ - updateColumn       │ │  │
│  │  └──────────┘  └──────────────┘  └──────────────────────┘ │  │
│  │                                                            │  │
│  │  ┌───────────────────┐                                     │  │
│  │  │    LayersPanel    │                                     │  │
│  │  │                   │                                     │  │
│  │  │ reads:            │                                     │  │
│  │  │ - template tree   │                                     │  │
│  │  │ - selectedId      │                                     │  │
│  │  │                   │                                     │  │
│  │  │ writes:           │                                     │  │
│  │  │ - selection       │                                     │  │
│  │  │ - moveSection     │                                     │  │
│  │  │ - moveBlock       │                                     │  │
│  │  └───────────────────┘                                     │  │
│  └────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Compilation Flow

```
┌──────────────┐
│ EmailTemplate│
│ (JSON)       │
└──────┬───────┘
       │
       ▼
┌──────────────┐
│ MJMLCompiler │
│              │
│ 1. Traverse  │
│    sections  │
│ 2. Generate  │
│    MJML tags │
│ 3. Handle    │
│    mj-group  │
└──────┬───────┘
       │
       ▼
┌──────────────┐
│ MJML String  │
│ (markup)     │
└──────┬───────┘
       │
       ▼
┌──────────────┐
│ mjml2html()  │
│ (official    │
│  mjml pkg)   │
└──────┬───────┘
       │
       ▼
┌──────────────┐
│ HTML String  │
│ (email-safe) │
└──────────────┘
```

---

## Key Files Reference

| File | Purpose |
|------|---------|
| `packages/core/src/store/index.ts` | Store creation and exports |
| `packages/core/src/store/types.ts` | Type definitions |
| `packages/core/src/store/documentSlice.ts` | Template state |
| `packages/core/src/store/interactionSlice.ts` | UI state |
| `packages/core/src/store/apiSlice.ts` | API config |
| `packages/core/src/store/middleware/history.ts` | Undo/redo |
| `packages/core/src/store/middleware/validation.ts` | MJML rules |
| `packages/core/src/schema/types.ts` | EmailTemplate types |
| `packages/core/src/compiler/MJMLCompiler.ts` | MJML generation |
| `packages/ui/src/hooks/useDropIntent.ts` | Drop zone calculation |
| `packages/ui/src/hooks/useEditorActions.ts` | Store action bridge |
| `packages/ui/src/EmailEditor.tsx` | Main component |

---

## Design Principles

1. **Document state is always MJML-valid**
   - Validation middleware prevents invalid mutations
   - Fallbacks make invalid operations "just work"

2. **High-frequency interactions are preview-only**
   - Drag/resize don't update document until commit
   - Prevents history pollution and janky UX

3. **mj-group is preferred for mobile horizontal columns**
   - Users never see "group" in the UI
   - Compiler handles the abstraction

4. **Undo/redo must be reliable**
   - Uses Immer patches for efficiency
   - Skips ephemeral state changes

5. **The editor is stateless from the host's perspective**
   - Host passes `value` and receives `onChange`
   - Store is internal implementation detail

---

**Last updated:** 2026-01-04

