// packages/editor/src/types.ts
// Public API types

import type { EmailTemplate, BlockDefinition } from '@marlinjai/email-editor-core';
import type { OnRequestImage } from '@marlinjai/email-editor-ui';

/**
 * Editor theme: brand colors and the UI font of the editor chrome. Each value
 * sets one design token on the editor's root element; anything left out keeps
 * the default. Every token (`--ee-*`) can also be overridden in the host's CSS
 * on `.ee-root`, outside any cascade layer.
 */
export interface EditorTheme {
  colors?: {
    /** Accent: primary buttons, selection, focus rings (`--ee-accent`) */
    primary?: string;
    /** Accent on hover (`--ee-accent-hover`) */
    primaryHover?: string;
    /** Light panel surfaces (`--ee-canvas-2`) */
    surface?: string;
    /** Text on light surfaces (`--ee-text-dark`) */
    text?: string;
    /** Borders on light surfaces (`--ee-border-light`) */
    border?: string;
  };
  fonts?: {
    /** Font stack of the editor chrome (`--ee-font-sans`) */
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
  /** Redefine standard block types (label, icon, category, default props). New types are refused. */
  blocks?: BlockDefinition[];
  onChange?: (template: EmailTemplate) => void;
  onSave?: (template: EmailTemplate) => void;
  /**
   * Supply images from your own picker or uploader. Resolve with
   * `{ url, alt? }`, or `null` when the user cancels (the block is left
   * unchanged). A rejected promise is shown inline in the image inspector.
   * Without it, the image inspector shows a plain URL field.
   */
  onRequestImage?: OnRequestImage;
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

