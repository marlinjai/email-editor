# API Reference

## createEditor(options)

Create an email editor instance (framework-agnostic).

### Parameters

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

### Returns

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

### Example

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

## EmailEditorReact Component

React wrapper for the editor.

### Props

```typescript
interface EmailEditorReactProps {
  value: EmailTemplate;
  onChange: (template: EmailTemplate) => void;
  theme?: EditorTheme;
  blocks?: BlockDefinition[];
  onSave?: () => void;
}
```

### Example

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
  createdAt?: string;
  updatedAt?: string;
}
```

### Section

```typescript
interface Section {
  id: string;
  type: 'section';
  backgroundColor?: string;
  backgroundImage?: string;
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
}
```

### Blocks

```typescript
type Block =
  | TextBlock
  | ImageBlock
  | ButtonBlock
  | DividerBlock
  | SpacerBlock
  | HeaderBlock
  | FooterBlock;

interface TextBlock {
  id: string;
  type: 'text';
  content: string;
  align?: 'left' | 'center' | 'right' | 'justify';
  color?: string;
  fontSize?: string;
  fontFamily?: string;
  padding?: Spacing;
}

// See packages/core/src/schema/types.ts for all block types
```

## Block Registry

### createStandardBlockRegistry()

Creates a registry with all standard blocks pre-registered.

```typescript
import { createStandardBlockRegistry } from '@returnhypnosis/email-editor-blocks';

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

## MJML Compiler

### createMJMLCompiler()

Create a compiler instance.

```typescript
import { createMJMLCompiler } from '@returnhypnosis/email-editor-core';

const compiler = createMJMLCompiler();
const result = compiler.compile(template);

console.log(result.html);  // Compiled HTML
console.log(result.mjml);  // MJML source
console.log(result.errors); // Validation errors (if any)
```

## History Manager

### createHistoryManager(initialState, maxSize?)

Create an undo/redo manager.

```typescript
import { createHistoryManager } from '@returnhypnosis/email-editor-core';

const history = createHistoryManager(initialTemplate, 50);

// Update state with Immer
const newState = history.updateState((draft) => {
  draft.sections[0].columns[0].blocks.push(newBlock);
});

// Undo/redo
history.undo();
history.redo();

// Check state
history.canUndo(); // boolean
history.canRedo(); // boolean
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

