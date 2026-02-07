// packages/core/src/store/mst/RootStore.ts
import { types, Instance, SnapshotIn, SnapshotOut, onSnapshot, applySnapshot, getSnapshot } from 'mobx-state-tree';
import { nanoid } from 'nanoid';
import {
  TemplateModel,
  TemplateInstance,
  TemplateSnapshotIn,
  createTemplate,
  createTemplateWithDefaultSection,
} from './models/TemplateModel';
import { EditorUIStore, EditorUIInstance } from './EditorUIStore';

/**
 * RootStore - The main store for the email editor
 *
 * Combines:
 * - TemplateModel: The domain state (template structure)
 * - EditorUIStore: The UI state (selection, panels, etc.)
 *
 * The RootStore also manages history (undo/redo) via middleware.
 */
export const RootStore = types
  .model('RootStore', {
    template: TemplateModel,
    editorUI: EditorUIStore,
  })
  .volatile(() => ({
    // History state for undo/redo
    history: [] as SnapshotOut<typeof TemplateModel>[],
    historyIndex: -1,
    maxHistory: 50,
    isUndoRedo: false,
  }))
  .actions(self => ({
    /**
     * Initialize history with current state
     */
    initHistory() {
      const snapshot = getSnapshot(self.template);
      self.history = [snapshot];
      self.historyIndex = 0;
    },

    /**
     * Record current state to history (called after mutations)
     */
    recordHistory() {
      if (self.isUndoRedo) return;

      const snapshot = getSnapshot(self.template);

      // Remove any future history if we're not at the end
      if (self.historyIndex < self.history.length - 1) {
        self.history = self.history.slice(0, self.historyIndex + 1);
      }

      // Add new snapshot
      self.history.push(snapshot);

      // Limit history size
      if (self.history.length > self.maxHistory) {
        self.history = self.history.slice(self.history.length - self.maxHistory);
      }

      self.historyIndex = self.history.length - 1;
    },

    /**
     * Undo to previous state
     */
    undo() {
      if (self.historyIndex <= 0) return false;

      self.isUndoRedo = true;
      self.historyIndex--;
      applySnapshot(self.template, self.history[self.historyIndex]);
      self.isUndoRedo = false;

      // Clear selection if the selected item no longer exists
      this.validateSelection();
      return true;
    },

    /**
     * Redo to next state
     */
    redo() {
      if (self.historyIndex >= self.history.length - 1) return false;

      self.isUndoRedo = true;
      self.historyIndex++;
      applySnapshot(self.template, self.history[self.historyIndex]);
      self.isUndoRedo = false;

      // Clear selection if the selected item no longer exists
      this.validateSelection();
      return true;
    },

    /**
     * Clear history
     */
    clearHistory() {
      const snapshot = getSnapshot(self.template);
      self.history = [snapshot];
      self.historyIndex = 0;
    },

    /**
     * Validate and clear selection if items no longer exist
     */
    validateSelection() {
      if (self.editorUI.selectedBlockId && !self.template.findBlockById(self.editorUI.selectedBlockId)) {
        self.editorUI.clearSelection();
      }
      if (self.editorUI.selectedSectionId && !self.template.getSectionById(self.editorUI.selectedSectionId)) {
        self.editorUI.clearSelection();
      }
      if (self.editorUI.selectedColumnId && !self.template.findColumnById(self.editorUI.selectedColumnId)) {
        self.editorUI.clearSelection();
      }
    },

    /**
     * Load a new template
     */
    loadTemplate(templateData: TemplateSnapshotIn) {
      applySnapshot(self.template, templateData);
      self.editorUI.clearSelection();
      this.clearHistory();
    },

    /**
     * Reset to a new empty template
     */
    resetTemplate(title?: string) {
      const newTemplate = createTemplateWithDefaultSection({ title });
      applySnapshot(self.template, newTemplate);
      self.editorUI.clearSelection();
      this.clearHistory();
    },
  }))
  .views(self => ({
    /**
     * Check if undo is available
     */
    get canUndo(): boolean {
      return self.historyIndex > 0;
    },

    /**
     * Check if redo is available
     */
    get canRedo(): boolean {
      return self.historyIndex < self.history.length - 1;
    },

    /**
     * Get the currently selected block
     */
    get selectedBlock() {
      if (!self.editorUI.selectedBlockId) return undefined;
      return self.template.findBlockById(self.editorUI.selectedBlockId);
    },

    /**
     * Get the currently selected section
     */
    get selectedSection() {
      if (!self.editorUI.selectedSectionId) return undefined;
      return self.template.getSectionById(self.editorUI.selectedSectionId);
    },

    /**
     * Get the currently selected column
     */
    get selectedColumn() {
      if (!self.editorUI.selectedColumnId) return undefined;
      return self.template.findColumnById(self.editorUI.selectedColumnId);
    },

    /**
     * Get history size info
     */
    get historyInfo() {
      return {
        current: self.historyIndex + 1,
        total: self.history.length,
        canUndo: self.historyIndex > 0,
        canRedo: self.historyIndex < self.history.length - 1,
      };
    },
  }));

export type RootStoreInstance = Instance<typeof RootStore>;
export type RootStoreSnapshotIn = SnapshotIn<typeof RootStore>;

// === Store Factory ===

/**
 * Options for creating a root store
 */
export interface CreateRootStoreOptions {
  /** Initial template data */
  template?: TemplateSnapshotIn;
  /** Callback when template changes */
  onChange?: (snapshot: SnapshotOut<typeof TemplateModel>) => void;
  /** Debounce time for onChange callback (ms) */
  onChangeDebounce?: number;
}

/**
 * Create a new RootStore instance
 */
export function createRootStore(options: CreateRootStoreOptions = {}): RootStoreInstance {
  const { template: initialTemplate, onChange, onChangeDebounce = 300 } = options;

  // Create store with initial state
  const store = RootStore.create({
    template: initialTemplate || createTemplateWithDefaultSection(),
    editorUI: {},
  });

  // Initialize history
  store.initHistory();

  // Set up onChange callback with debouncing
  if (onChange) {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    onSnapshot(store.template, (snapshot) => {
      // Record history
      store.recordHistory();

      // Debounced onChange callback
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        onChange(snapshot);
      }, onChangeDebounce);
    });
  } else {
    // Just record history on changes
    onSnapshot(store.template, () => {
      store.recordHistory();
    });
  }

  return store;
}

/**
 * Create store with empty template
 */
export function createEmptyStore(): RootStoreInstance {
  return createRootStore({
    template: createTemplate(),
  });
}
