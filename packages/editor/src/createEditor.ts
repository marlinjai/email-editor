// packages/editor/src/createEditor.ts
// Framework-agnostic editor factory

import { createRoot, Root } from 'react-dom/client';
import { createElement } from 'react';
import type { EmailTemplate, TemplateSnapshotIn, TemplateSnapshotOut } from '@marlinjai/email-editor-core';
import { createStandardBlockRegistry } from '@marlinjai/email-editor-blocks';
import { EmailEditor } from '@marlinjai/email-editor-ui';
import type { EditorOptions, EditorInstance } from './types';

/**
 * Convert EmailTemplate to TemplateSnapshotIn
 * Handles differences between schema types and MST types
 */
function toSnapshotIn(template: EmailTemplate | undefined): TemplateSnapshotIn {
  if (!template) {
    return {
      id: `template-${Date.now()}`,
      version: '1.0',
      metadata: {
        title: 'New Email',
        subject: '',
        previewText: '',
      },
      sections: [],
    } as TemplateSnapshotIn;
  }

  // Use type assertion for compatibility
  return {
    id: (template as any).id || `template-${Date.now()}`,
    ...template,
  } as unknown as TemplateSnapshotIn;
}

/**
 * Create an email editor instance
 * Framework-agnostic public API
 */
export function createEditor(options: EditorOptions): EditorInstance {
  const {
    container,
    initialValue,
    theme,
    blocks = [],
    onChange,
    onSave,
  } = options;

  // Convert to MST-compatible snapshot
  const initialSnapshot = toSnapshotIn(initialValue);

  // Create block registry with standard blocks
  const registry = createStandardBlockRegistry();

  // Register custom blocks
  blocks.forEach((block) => registry.register(block));

  // Current template state
  let currentTemplate: EmailTemplate = initialValue || ({
    version: '1.0',
    metadata: { title: 'New Email', subject: '', previewText: '' },
    sections: [],
  } as EmailTemplate);

  // Handle template changes
  const handleChange = (snapshot: TemplateSnapshotOut) => {
    // Convert snapshot back to EmailTemplate
    currentTemplate = snapshot as unknown as EmailTemplate;
    onChange?.(currentTemplate);
  };

  // Handle save
  const handleSave = () => {
    onSave?.(currentTemplate);
  };

  // Render React component
  let root: Root | null = null;
  const render = () => {
    if (!root) {
      root = createRoot(container);
    }

    root.render(
      createElement(EmailEditor, {
        initialTemplate: initialSnapshot,
        onChange: handleChange,
        blockRegistry: registry,
        onSave: handleSave,
      } as any)
    );
  };

  // Initial render
  render();

  // Return editor instance API
  return {
    getValue() {
      return currentTemplate;
    },

    setValue(template: EmailTemplate) {
      currentTemplate = template;
      // Note: Setting value requires re-mounting the editor
      // This is a limitation of the current implementation
      render();
    },

    getHTML() {
      console.warn('getHTML() requires a server-side compiler');
      return '';
    },

    getMJML() {
      console.warn('getMJML() requires a server-side compiler');
      return '';
    },

    undo() {
      // Undo is handled internally by EmailEditor component
      console.warn('Undo via API not yet implemented');
    },

    redo() {
      // Redo is handled internally by EmailEditor component
      console.warn('Redo via API not yet implemented');
    },

    destroy() {
      if (root) {
        root.unmount();
        root = null;
      }
    },
  };
}
