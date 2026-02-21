---
title: Architecture
description: Package layering, data flow, and design decisions for the email editor
order: 1
---

# Email Editor Architecture

## Overview

The email editor is built as a **layered monorepo** with clear separation of concerns. Each package has a specific responsibility and can be used independently or combined.

```mermaid
graph TB
    subgraph "Consumer Layer"
        APP[Your App]
    end

    subgraph "Convenience Layer"
        EDITOR["@returnhypnosis/email-editor<br/>(High-level API)"]
    end

    subgraph "Implementation Layer"
        UI["@returnhypnosis/email-editor-ui<br/>(React Components)"]
        BLOCKS["@returnhypnosis/email-editor-blocks<br/>(Block Definitions)"]
    end

    subgraph "Foundation Layer"
        CORE["@returnhypnosis/email-editor-core<br/>(Framework-Agnostic Engine)"]
    end

    APP --> EDITOR
    EDITOR --> UI
    EDITOR --> BLOCKS
    UI --> CORE
    BLOCKS --> CORE
```

## Package Responsibilities

### 1. Core Package (`@returnhypnosis/email-editor-core`)

**Purpose:** Framework-agnostic state management, types, and MJML compilation.

**Key Characteristic:** NO React dependency. Can be used with Vue, Svelte, or vanilla JS.

```mermaid
graph LR
    subgraph "@returnhypnosis/email-editor-core"
        subgraph "State (MST)"
            ROOT[RootStore]
            TEMPLATE[TemplateModel]
            SECTION[SectionModel]
            COLUMN[ColumnModel]
            BLOCK[BlockModel]
            UI_STATE[EditorUIStore]
        end

        subgraph "Types"
            SCHEMA[Schema Types]
            REGISTRY[Block Registry]
        end

        subgraph "Server Only"
            MJML[MJML Exporter]
        end

        ROOT --> TEMPLATE
        ROOT --> UI_STATE
        TEMPLATE --> SECTION
        SECTION --> COLUMN
        COLUMN --> BLOCK
    end
```

**Exports:**

| Export | Description | Use Case |
|--------|-------------|----------|
| `RootStore`, `createRootStore` | MST store factory | Create editor state |
| `TemplateModel`, `SectionModel`, etc. | MST models | Type-safe state management |
| `BlockType`, `BlockRegistry` | Block definitions | Register custom blocks |
| `EmailTemplate`, `Section`, `Block` | TypeScript types | Type your templates |
| `MJMLExporter` (from `/server`) | MJML compiler | Server-side HTML generation |

**Entry Points:**
- `@returnhypnosis/email-editor-core` - Client-safe (no MJML)
- `@returnhypnosis/email-editor-core/server` - Server-only (includes MJML)

---

### 2. UI Package (`@returnhypnosis/email-editor-ui`)

**Purpose:** React implementation of the visual editor.

**Key Characteristic:** React-specific. Provides the actual UI components.

```mermaid
graph TB
    subgraph "@returnhypnosis/email-editor-ui"
        subgraph "Main Component"
            EDITOR_COMP[EmailEditor]
        end

        subgraph "Store Bindings"
            PROVIDER[StoreProvider]
            HOOKS[useStore, useTemplate, useEditorUI]
        end

        subgraph "Renderer"
            EMAIL_RENDER[EmailRenderer]
            SECTION_RENDER[SectionRenderer]
            COLUMN_RENDER[ColumnRenderer]
            BLOCK_RENDER[BlockRenderer]
        end

        subgraph "Block Renderers"
            TEXT[TextBlock]
            IMAGE[ImageBlock]
            BUTTON[ButtonBlock]
            DIVIDER[DividerBlock]
            MORE[...]
        end

        subgraph "Inspector"
            PROP_INSPECTOR[PropertyInspector]
            FIELDS[Form Fields]
        end

        subgraph "Sidebar"
            LEFT_SIDEBAR[LeftSidebar]
            ELEMENTS[ElementsPanel]
            LAYERS[LayersPanel]
            SETTINGS[SettingsPanel]
        end

        EDITOR_COMP --> PROVIDER
        EDITOR_COMP --> EMAIL_RENDER
        EDITOR_COMP --> PROP_INSPECTOR
        EDITOR_COMP --> LEFT_SIDEBAR

        EMAIL_RENDER --> SECTION_RENDER
        SECTION_RENDER --> COLUMN_RENDER
        COLUMN_RENDER --> BLOCK_RENDER
        BLOCK_RENDER --> TEXT
        BLOCK_RENDER --> IMAGE
        BLOCK_RENDER --> BUTTON
    end
```

**Exports:**

| Export | Description |
|--------|-------------|
| `EmailEditor` | Main editor React component |
| `StoreProvider`, `useStore` | React context for MST store |
| `EmailRenderer` | Preview renderer component |
| `PropertyInspector` | Property editing panel |
| Form fields | Reusable input components |

---

### 3. Blocks Package (`@returnhypnosis/email-editor-blocks`)

**Purpose:** Standard block library and prebuilt templates.

**Key Characteristic:** Defines what blocks are available and their default configurations.

```mermaid
graph LR
    subgraph "@returnhypnosis/email-editor-blocks"
        subgraph "Block Definitions"
            TEXT_DEF[Text Block]
            IMAGE_DEF[Image Block]
            BUTTON_DEF[Button Block]
            SOCIAL_DEF[Social Block]
            MORE_DEF[...]
        end

        subgraph "Prebuilt Templates"
            HERO_TPL[Hero Section]
            FEATURE_TPL[Feature Grid]
            CTA_TPL[Call to Action]
        end

        subgraph "Factories"
            BLOCK_REG[createStandardBlockRegistry]
            PREBUILT_REG[createStandardPrebuiltRegistry]
        end
    end
```

**Exports:**

| Export | Description |
|--------|-------------|
| `createStandardBlockRegistry()` | Factory for standard blocks |
| `createStandardPrebuiltRegistry()` | Factory for prebuilt sections |
| Block definitions | Individual block configs |

---

### 4. Editor Package (`@returnhypnosis/email-editor`)

**Purpose:** High-level convenience wrapper for easy integration.

**Key Characteristic:** Combines all packages into simple APIs.

```mermaid
graph TB
    subgraph "@returnhypnosis/email-editor"
        subgraph "Vanilla JS API"
            CREATE[createEditor]
        end

        subgraph "React API"
            REACT_COMP[EmailEditorReact]
        end

        subgraph "Re-exports"
            TYPES[Types]
        end
    end

    CREATE --> |uses| CORE_INT[core + ui + blocks]
    REACT_COMP --> |uses| CORE_INT
```

**Exports:**

| Export | Entry Point | Description |
|--------|-------------|-------------|
| `createEditor()` | `@returnhypnosis/email-editor` | Vanilla JS factory |
| `EmailEditorReact` | `@returnhypnosis/email-editor/react` | React component |
| Types | Both | Re-exported for convenience |

---

## Data Flow

```mermaid
sequenceDiagram
    participant User
    participant UI as UI (React)
    participant Store as MST Store
    participant Model as MST Model

    User->>UI: Change font color
    UI->>Store: block.updateStyle('color', '#ff0000')
    Store->>Model: MST action updates property
    Model-->>UI: MobX reactivity triggers re-render
    UI-->>User: Instant visual update (<16ms)

    Note over User,Model: No MJML compilation during editing!

    User->>UI: Click Export
    UI->>Store: Get template snapshot
    Store-->>UI: Template data
    UI->>Server: POST /api/compile
    Server->>MJML: Compile to HTML
    MJML-->>Server: HTML output
    Server-->>UI: Download HTML
```

---

## Why This Architecture?

### Problem: Slow MJML Compilation

The previous architecture compiled MJML on every property change:

```
Property change → MJML compile (100-300ms) → iframe.write() → Visual update
```

This caused noticeable lag when editing.

### Solution: MST + React Renderer

The new architecture separates editing from compilation:

```
Property change → MST action → MobX observer re-render (<16ms) → Visual update

Export button → MJML compile (once) → HTML output
```

---

## Usage Patterns

### Pattern 1: Full Editor (Most Common)

Use the high-level wrapper for complete functionality:

```tsx
import { EmailEditorReact } from '@returnhypnosis/email-editor/react';
import '@returnhypnosis/email-editor/styles.css';

function App() {
  return (
    <EmailEditorReact
      initialTemplate={myTemplate}
      onChange={(template) => console.log(template)}
      onExport={(template) => sendToServer(template)}
    />
  );
}
```

### Pattern 2: Custom UI with Core State

Use core package directly for custom implementations:

```tsx
import { createRootStore, RootStore } from '@returnhypnosis/email-editor-core';

// Works with any framework!
const store = createRootStore({
  template: myTemplate,
  onChange: (snapshot) => saveToDatabase(snapshot),
});

// Direct MST operations
store.template.addSection(sectionData);
store.template.findBlockById('block-1')?.updateStyle('color', 'red');
```

### Pattern 3: Server-Side Compilation

Use the server export for MJML:

```ts
// api/compile.ts
import { MJMLExporter } from '@returnhypnosis/email-editor-core/server';

const exporter = new MJMLExporter();

export async function POST(request: Request) {
  const template = await request.json();
  const { html, mjml, errors } = exporter.export(template);
  return Response.json({ html, mjml, errors });
}
```

### Pattern 4: Vue/Svelte Implementation

The core is framework-agnostic. You could build a Vue UI:

```ts
// Hypothetical Vue implementation
import { createRootStore } from '@returnhypnosis/email-editor-core';

// Create store (same as React)
const store = createRootStore({ template });

// Use with Vue reactivity
const template = computed(() => store.template);

// Call MST actions
function changeColor(blockId: string, color: string) {
  store.template.findBlockById(blockId)?.updateStyle('color', color);
}
```

---

## File Structure

```
packages/
├── core/                          # Framework-agnostic engine
│   └── src/
│       ├── store/mst/             # MobX State Tree
│       │   ├── models/            # Data models
│       │   │   ├── BlockModel.ts
│       │   │   ├── ColumnModel.ts
│       │   │   ├── SectionModel.ts
│       │   │   └── TemplateModel.ts
│       │   ├── EditorUIStore.ts   # UI state (selection, panels)
│       │   ├── RootStore.ts       # Main store
│       │   └── MJMLExporter.ts    # Server-only compiler
│       ├── schema/                # TypeScript types
│       ├── registry/              # Block registry
│       ├── index.ts               # Client entry
│       └── server.ts              # Server entry (MJML)
│
├── ui/                            # React implementation
│   └── src/
│       ├── store/                 # React bindings
│       │   └── StoreContext.tsx   # Provider + hooks
│       ├── renderer/              # Preview components
│       │   ├── EmailRenderer.tsx
│       │   ├── SectionRenderer.tsx
│       │   ├── ColumnRenderer.tsx
│       │   ├── BlockRenderer.tsx
│       │   └── blocks/            # Block renderers
│       ├── inspector/             # Property panels
│       ├── sidebar/               # Left sidebar
│       └── EmailEditor.tsx        # Main component
│
├── blocks/                        # Block definitions
│   └── src/
│       ├── definitions/           # Block configs
│       ├── prebuilt/              # Prebuilt templates
│       └── index.ts               # Registry factories
│
└── editor/                        # High-level wrapper
    └── src/
        ├── createEditor.ts        # Vanilla JS API
        ├── react.tsx              # React wrapper
        └── types.ts               # Public types
```

---

## Dependency Graph

```mermaid
graph BT
    CORE["core<br/>(0 React deps)"]
    BLOCKS["blocks<br/>(React for TipTap)"]
    UI["ui<br/>(React)"]
    EDITOR["editor<br/>(React)"]
    EXAMPLE["examples/nextjs"]

    BLOCKS --> CORE
    UI --> CORE
    EDITOR --> CORE
    EDITOR --> UI
    EDITOR --> BLOCKS
    EXAMPLE --> EDITOR

    style CORE fill:#90EE90
    style BLOCKS fill:#FFE4B5
    style UI fill:#FFE4B5
    style EDITOR fill:#ADD8E6
```

**Legend:**
- Green = Framework agnostic
- Orange = React-specific
- Blue = Convenience wrapper

---

## Key Design Decisions

1. **MST for State**: MobX State Tree provides fine-grained reactivity, undo/redo via snapshots, and type-safe actions.

2. **MJML on Export Only**: Compilation is expensive (100-300ms). Moving it to export-only gives instant (<16ms) editing feedback.

3. **React in Renderer, Not Core**: The core package has no React dependency. This allows potential Vue/Svelte implementations using the same state engine.

4. **Blocks as Separate Package**: Block definitions are decoupled from rendering. You can use standard blocks or define custom ones.

5. **Two Entry Points for Core**: Client-safe entry excludes MJML (large dependency). Server entry includes it for compilation.
