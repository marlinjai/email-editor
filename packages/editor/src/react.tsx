// packages/editor/src/react.tsx
// React wrapper component

import { useState, useEffect } from 'react';
import type { EmailTemplate, BlockDefinition } from '@returnhypnosis/email-editor-core';
import { createStandardBlockRegistry } from '@returnhypnosis/email-editor-blocks';
import { EmailEditor } from '@returnhypnosis/email-editor-ui';
import type { EditorTheme } from './types';

// Import styles
import '@returnhypnosis/email-editor-ui/styles.css';

interface EmailEditorReactProps {
  value: EmailTemplate;
  onChange: (template: EmailTemplate) => void;
  theme?: EditorTheme;
  blocks?: BlockDefinition[];
  onSave?: () => void;
}

/**
 * React wrapper for email editor
 * Convenience component for React applications
 */
export function EmailEditorReact({
  value,
  onChange,
  theme,
  blocks = [],
  onSave,
}: EmailEditorReactProps) {
  const [registry] = useState(() => {
    const reg = createStandardBlockRegistry();
    blocks.forEach((block) => reg.register(block));
    return reg;
  });

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
      value={value}
      onChange={onChange}
      blockRegistry={registry}
      onSave={onSave}
    />
  );
}

// Re-export types
export type { EmailTemplate, BlockDefinition } from '@returnhypnosis/email-editor-core';
export type { EditorTheme } from './types';

