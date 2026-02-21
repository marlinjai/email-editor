// packages/ui/src/store/StoreContext.tsx
// React bindings for MST store

import React, { createContext, useContext, type Provider } from 'react';
import type {
  RootStoreInstance,
  TemplateInstance,
  EditorUIInstance,
  BlockInstance,
  SectionInstance,
  ColumnInstance,
} from '@marlinjai/email-editor-core';

/**
 * React context for the store
 */
const StoreContext = createContext<RootStoreInstance | null>(null);

/**
 * Provider component for the store
 */
export const StoreProvider: Provider<RootStoreInstance | null> = StoreContext.Provider;

/**
 * Hook to access the full store
 * @throws Error if used outside of StoreProvider
 */
export function useStore(): RootStoreInstance {
  const store = useContext(StoreContext);
  if (!store) {
    throw new Error('useStore must be used within a StoreProvider');
  }
  return store;
}

/**
 * Hook to access just the template
 */
export function useTemplate(): TemplateInstance {
  const store = useStore();
  return store.template;
}

/**
 * Hook to access just the editor UI store
 */
export function useEditorUI(): EditorUIInstance {
  const store = useStore();
  return store.editorUI;
}

/**
 * Hook to get the selected block (convenience)
 */
export function useSelectedBlock(): BlockInstance | undefined {
  const store = useStore();
  return store.selectedBlock;
}

/**
 * Hook to get the selected section (convenience)
 */
export function useSelectedSection(): SectionInstance | undefined {
  const store = useStore();
  return store.selectedSection;
}

/**
 * Hook to get the selected column (convenience)
 */
export function useSelectedColumn(): ColumnInstance | undefined {
  const store = useStore();
  return store.selectedColumn;
}
