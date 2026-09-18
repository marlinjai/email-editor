// packages/editor/src/react.tsx
// React wrapper component

import { useMemo, useState } from 'react';
import type { TemplateSnapshotIn, TemplateSnapshotOut, BlockDefinition } from '@marlinjai/email-editor-core';
import { createStandardBlockRegistry, createStandardPrebuiltRegistry } from '@marlinjai/email-editor-blocks';
import { EmailEditor, type OnRequestImage } from '@marlinjai/email-editor-ui';
import type { EditorTheme } from './types';
import { themeToStyle } from './theme';

interface EmailEditorReactProps {
  /** Initial template data (uncontrolled) */
  initialTemplate?: TemplateSnapshotIn;
  /** Called when template changes */
  onChange?: (template: TemplateSnapshotOut) => void;
  /** Editor theme */
  theme?: EditorTheme;
  /** Additional block definitions */
  blocks?: BlockDefinition[];
  /** Called when save button is clicked */
  onSave?: () => void;
  /** Called when export is requested */
  onExport?: (template: TemplateSnapshotOut) => void;
  /** Called when back button is clicked to navigate away from editor */
  onNavigateBack?: () => void;
  /**
   * Supply images from your own picker or uploader. Resolve with
   * `{ url, alt? }`, or `null` when the user cancels (the block is left
   * unchanged). A rejected promise is shown inline in the image inspector.
   * Without it, the image inspector shows a plain URL field.
   */
  onRequestImage?: OnRequestImage;
}

/**
 * React wrapper for email editor
 * Convenience component for React applications
 */
export function EmailEditorReact({
  initialTemplate,
  onChange,
  theme,
  blocks = [],
  onSave,
  onExport,
  onNavigateBack,
  onRequestImage,
}: EmailEditorReactProps) {
  const [registry] = useState(() => {
    const reg = createStandardBlockRegistry();
    blocks.forEach((block) => reg.register(block));
    return reg;
  });

  // Create pre-built template registry
  const [prebuiltRegistry] = useState(() => createStandardPrebuiltRegistry());

  // The theme becomes design tokens on the editor's own root element, so it
  // never touches the host page.
  const style = useMemo(() => themeToStyle(theme), [theme]);

  return (
    <EmailEditor
      initialTemplate={initialTemplate}
      onChange={onChange}
      blockRegistry={registry}
      prebuiltRegistry={prebuiltRegistry}
      onSave={onSave}
      onExport={onExport}
      onNavigateBack={onNavigateBack}
      onRequestImage={onRequestImage}
      style={style}
    />
  );
}

// Re-export types
export type { TemplateSnapshotIn, TemplateSnapshotOut, BlockDefinition } from '@marlinjai/email-editor-core';
export type { EditorTheme } from './types';
export type { OnRequestImage, ImageRequest, RequestedImage } from '@marlinjai/email-editor-ui';
