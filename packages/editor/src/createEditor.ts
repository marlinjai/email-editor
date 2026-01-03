// packages/editor/src/createEditor.ts
// Framework-agnostic editor factory

import { createRoot, Root } from 'react-dom/client';
import { createElement } from 'react';
import { EmailTemplate } from '@returnhypnosis/email-editor-core';
import { createStandardBlockRegistry } from '@returnhypnosis/email-editor-blocks';
import { EmailEditor } from '@returnhypnosis/email-editor-ui';
import type { EditorOptions, EditorInstance } from './types';

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

  // Create default template if not provided
  const defaultTemplate: EmailTemplate = initialValue || {
    version: '1.0',
    metadata: {
      subject: 'New Email',
      previewText: '',
    },
    sections: [],
  };

  // Create block registry with standard blocks
  const registry = createStandardBlockRegistry();

  // Register custom blocks
  blocks.forEach((block) => registry.register(block));

  // Current template state
  let currentTemplate = defaultTemplate;

  // Handle template changes
  const handleChange = (template: EmailTemplate) => {
    currentTemplate = template;
    onChange?.(template);
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
        value: currentTemplate,
        onChange: handleChange,
        blockRegistry: registry,
        onSave: handleSave,
      })
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

