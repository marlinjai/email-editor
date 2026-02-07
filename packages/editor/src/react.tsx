// packages/editor/src/react.tsx
// React wrapper component

import { useState, useEffect } from 'react';
import type { TemplateSnapshotIn, TemplateSnapshotOut, BlockDefinition } from '@returnhypnosis/email-editor-core';
import { createStandardBlockRegistry, createStandardPrebuiltRegistry } from '@returnhypnosis/email-editor-blocks';
import { EmailEditor } from '@returnhypnosis/email-editor-ui';
import type { EditorTheme } from './types';

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
}: EmailEditorReactProps) {
  const [registry] = useState(() => {
    const reg = createStandardBlockRegistry();
    blocks.forEach((block) => reg.register(block));
    return reg;
  });

  // Create pre-built template registry
  const [prebuiltRegistry] = useState(() => createStandardPrebuiltRegistry());

  // Apply theme if provided
  useEffect(() => {
    if (theme?.colors) {
      const root = document.documentElement;
      if (theme.colors.primary) {
        root.style.setProperty('--color-brand-primary', theme.colors.primary);
      }
      if (theme.colors.surface) {
        root.style.setProperty('--color-brand-surface', theme.colors.surface);
      }
      if (theme.colors.text) {
        root.style.setProperty('--color-brand-text', theme.colors.text);
      }
      if (theme.colors.border) {
        root.style.setProperty('--color-brand-border', theme.colors.border);
      }
    }
  }, [theme]);

  return (
    <EmailEditor
      initialTemplate={initialTemplate}
      onChange={onChange}
      blockRegistry={registry}
      prebuiltRegistry={prebuiltRegistry}
      onSave={onSave}
      onExport={onExport}
    />
  );
}

// Re-export types
export type { TemplateSnapshotIn, TemplateSnapshotOut, BlockDefinition } from '@returnhypnosis/email-editor-core';
export type { EditorTheme } from './types';
