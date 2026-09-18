// packages/editor/src/createEditor.ts
// Framework-agnostic editor factory

import { createRoot, Root } from 'react-dom/client';
import { createElement } from 'react';
import { withTemplateId, type EmailTemplate, type TemplateSnapshotIn, type TemplateSnapshotOut } from '@marlinjai/email-editor-core';
import { createStandardBlockRegistry, createStandardPrebuiltRegistry } from '@marlinjai/email-editor-blocks';
import { EmailEditor } from '@marlinjai/email-editor-ui';
import type { EditorOptions, EditorInstance } from './types';
import { themeToStyle } from './theme';
import { assertSupportedBlocks } from './blocks';

/** What the editor opens when the host passes no document. */
function emptyTemplate(): EmailTemplate {
  return {
    version: '1.0',
    metadata: { title: 'New Email', subject: '', previewText: '' },
    sections: [],
  };
}

/**
 * The document the editor opens, with an id. A document without one gets a
 * fresh id here, on a copy (the host's object is never changed), and that same
 * id is what `getValue`, `onChange` and `onSave` hand back from then on.
 */
function openable(template: EmailTemplate | undefined): EmailTemplate & { id: string } {
  return withTemplateId(template ?? emptyTemplate());
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
    onRequestImage,
  } = options;

  assertSupportedBlocks(blocks);

  // Create block registry with standard blocks
  const registry = createStandardBlockRegistry();

  // Register custom blocks
  blocks.forEach((block) => {
    registry.unregister(block.type); // replace the standard definition quietly
    registry.register(block);
  });

  // Pre-built sections, as the React wrapper offers them
  const prebuiltRegistry = createStandardPrebuiltRegistry();

  // Current template state: always the id-bearing document the editor holds.
  let currentTemplate: EmailTemplate = openable(initialValue);
  // Bumped by setValue, so the editor remounts with a store for the new document.
  let generation = 0;

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
        key: generation,
        initialTemplate: currentTemplate as unknown as TemplateSnapshotIn,
        onChange: handleChange,
        blockRegistry: registry,
        prebuiltRegistry,
        onSave: handleSave,
        onRequestImage,
        style: themeToStyle(theme),
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
      // The editor's store is created once per mount, so a new document means a
      // new mount (undo history starts over with it).
      currentTemplate = openable(template);
      generation += 1;
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
