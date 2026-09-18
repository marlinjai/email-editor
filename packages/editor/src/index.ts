// packages/editor/src/index.ts
// Main package exports

export { createEditor } from './createEditor';
export type { EditorOptions, EditorInstance, EditorTheme } from './types';
export type { OnRequestImage, ImageRequest, RequestedImage } from '@marlinjai/email-editor-ui';

// Re-export core types for convenience
export type {
  EmailTemplate,
  Block,
  Section,
  Column,
  BlockDefinition,
} from '@marlinjai/email-editor-core';

