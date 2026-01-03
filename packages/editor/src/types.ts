// packages/editor/src/types.ts
// Public API types

import type { EmailTemplate, BlockDefinition } from '@returnhypnosis/email-editor-core';

/**
 * Editor theme configuration
 */
export interface EditorTheme {
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

/**
 * Editor configuration options
 */
export interface EditorOptions {
  container: HTMLElement;
  initialValue?: EmailTemplate;
  theme?: EditorTheme;
  blocks?: BlockDefinition[];
  onChange?: (template: EmailTemplate) => void;
  onSave?: (template: EmailTemplate) => void;
}

/**
 * Editor instance API
 */
export interface EditorInstance {
  getValue(): EmailTemplate;
  setValue(template: EmailTemplate): void;
  getHTML(): string;
  getMJML(): string;
  undo(): void;
  redo(): void;
  destroy(): void;
}

