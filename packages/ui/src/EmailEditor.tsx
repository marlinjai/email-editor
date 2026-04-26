// packages/ui/src/EmailEditor.tsx
// Main Email Editor component with MST state management

import React, { useState, useEffect, useCallback } from 'react';
import { observer } from 'mobx-react-lite';
import {
  DndContext,
  DragEndEvent,
  DragStartEvent,
  DragOverlay,
  useSensor,
  useSensors,
  PointerSensor,
  closestCenter,
} from '@dnd-kit/core';
import {
  Undo,
  Redo,
  Save,
  Monitor,
  Smartphone,
  ZoomIn,
  ZoomOut,
  Download,
  ArrowLeft,
} from 'lucide-react';
import {
  createRootStore,
  BlockType,
  createSection,
  isLeafBlockType,
  type RootStoreInstance,
  type TemplateSnapshotIn,
  type TemplateSnapshotOut,
  type BlockSnapshotIn,
  type SectionSnapshotIn,
} from '@marlinjai/email-editor-core';
import { StoreProvider, useStore } from './store';
import { EmailRenderer } from './renderer';
import { PropertyInspector } from './inspector';
import { LeftSidebar } from './sidebar/LeftSidebar';
import { DragOverlayContent } from './DragOverlayContent';
import { nanoid } from 'nanoid';
import clsx from 'clsx';
import type { BlockRegistryImpl, PrebuiltTemplateRegistry } from '@marlinjai/email-editor-core';

export interface EmailEditorProps {
  /** Initial template data */
  initialTemplate?: TemplateSnapshotIn;
  /** Called when template changes */
  onChange?: (template: TemplateSnapshotOut) => void;
  /** Block registry for available block types */
  blockRegistry: BlockRegistryImpl;
  /** Pre-built template registry */
  prebuiltRegistry?: PrebuiltTemplateRegistry;
  /** Called when save button is clicked */
  onSave?: () => void;
  /** Called when export is requested */
  onExport?: (template: TemplateSnapshotOut) => void;
  /** Called when back button is clicked to navigate away from editor */
  onNavigateBack?: () => void;
}

/**
 * EmailEditor - Main email editor component
 *
 * Uses MobX State Tree for instant visual feedback on property changes.
 * MJML compilation only happens on export, not during editing.
 */
export const EmailEditor = observer(function EmailEditor({
  initialTemplate,
  onChange,
  blockRegistry,
  prebuiltRegistry,
  onSave,
  onExport,
  onNavigateBack,
}: EmailEditorProps) {
  const [store] = useState(() =>
    createRootStore({
      template: initialTemplate,
      onChange: onChange as any,
    })
  );

  return (
    <StoreProvider value={store}>
      <EmailEditorContent
        blockRegistry={blockRegistry}
        prebuiltRegistry={prebuiltRegistry}
        onSave={onSave}
        onExport={onExport}
        onNavigateBack={onNavigateBack}
      />
    </StoreProvider>
  );
});

// === Inner Content Component ===

interface ContentProps {
  blockRegistry: BlockRegistryImpl;
  prebuiltRegistry?: PrebuiltTemplateRegistry;
  onSave?: () => void;
  onExport?: (template: TemplateSnapshotOut) => void;
  onNavigateBack?: () => void;
}

const EmailEditorContent = observer(function EmailEditorContent({
  blockRegistry,
  prebuiltRegistry,
  onSave,
  onExport,
  onNavigateBack,
}: ContentProps) {
  const store = useStore();
  const { template, editorUI } = store;

  const [activeDragItem, setActiveDragItem] = useState<{
    type: 'block' | 'template';
    id: string;
    label: string;
  } | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  // Keyboard shortcuts
  useKeyboardShortcuts(store);

  // === Drag Handlers ===
  const handleDragStart = useCallback((event: DragStartEvent) => {
    const { active } = event;
    const blockType = active.data.current?.blockType as string;
    const templateId = active.data.current?.templateId as string;

    if (blockType) {
      const definition = blockRegistry.get(blockType);
      setActiveDragItem({
        type: 'block',
        id: blockType,
        label: definition?.label || blockType,
      });
      editorUI.startNewBlockDrag(blockType);
    } else if (templateId) {
      const prebuilt = prebuiltRegistry?.get(templateId);
      setActiveDragItem({
        type: 'template',
        id: templateId,
        label: prebuilt?.name || templateId,
      });
    }
  }, [blockRegistry, prebuiltRegistry, editorUI]);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    setActiveDragItem(null);
    editorUI.endDrag();

    handleDrop(active, over, template, blockRegistry, prebuiltRegistry, editorUI);
  }, [template, blockRegistry, prebuiltRegistry, editorUI]);

  const handleDragCancel = useCallback(() => {
    setActiveDragItem(null);
    editorUI.endDrag();
  }, [editorUI]);

  // === Section/Block Actions ===
  const handleAddSection = useCallback((columnCount: 1 | 2 | 3) => {
    const section = createSection({ columnCount });
    template.addSection(section);
    editorUI.selectSection(section.id);
  }, [template, editorUI]);

  const handleAddPrebuilt = useCallback((prebuilt: { section: any }) => {
    const newSection = cloneSectionWithNewIds(prebuilt.section);
    template.addSection(newSection);
    editorUI.selectSection(newSection.id);
  }, [template, editorUI]);

  const handleDeleteBlock = useCallback((blockId: string) => {
    template.deleteBlock(blockId);
    if (editorUI.selectedBlockId === blockId) {
      editorUI.clearSelection();
    }
  }, [template, editorUI]);

  const handleExport = useCallback(() => {
    if (onExport) {
      const snapshot = JSON.parse(JSON.stringify(template)) as TemplateSnapshotOut;
      onExport(snapshot);
    }
  }, [template, onExport]);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div className="email-editor h-screen flex flex-col bg-canvas-1">
        <EditorToolbar
          onSave={onSave}
          onExport={onExport ? handleExport : undefined}
          onNavigateBack={onNavigateBack}
        />

        <div className="flex-1 flex overflow-hidden">
          <LeftSidebar
            blockRegistry={blockRegistry}
            prebuiltRegistry={prebuiltRegistry}
            onAddSection={handleAddSection}
            onAddPrebuilt={handleAddPrebuilt}
          />

          <div className="flex-1 overflow-auto bg-canvas-1 p-8">
            <EmailRenderer />
          </div>

          <PropertyInspector onDeleteBlock={handleDeleteBlock} />
        </div>
      </div>

      <DragOverlay
        dropAnimation={{ duration: 200, easing: 'cubic-bezier(0.18, 0.67, 0.6, 1.22)' }}
      >
        {activeDragItem && <DragOverlayContent item={activeDragItem} />}
      </DragOverlay>
    </DndContext>
  );
});

// === Toolbar Component ===

interface ToolbarProps {
  onSave?: () => void;
  onExport?: () => void;
  onNavigateBack?: () => void;
}

const EditorToolbar = observer(function EditorToolbar({ onSave, onExport, onNavigateBack }: ToolbarProps) {
  const store = useStore();
  const { template, editorUI } = store;

  return (
    <div className="bg-midnight-2 border-b border-border-default px-4 py-2 flex items-center gap-4">
      {/* Back button */}
      {onNavigateBack && (
        <button
          onClick={onNavigateBack}
          className="p-2 rounded transition-colors hover:bg-midnight-3 text-text-secondary hover:text-text-primary"
          title="Back to dashboard"
        >
          <ArrowLeft size={18} />
        </button>
      )}

      <h1 className="text-sm font-semibold text-text-primary">Email Editor</h1>

      <input
        type="text"
        placeholder="Template title..."
        value={template.metadata.title}
        onChange={(e) => template.updateMetadata({ title: e.target.value })}
        className="px-3 py-1.5 bg-midnight-3 border border-border-default rounded text-sm w-64 text-text-primary placeholder:text-text-secondary focus:outline-none focus:ring-2 focus:ring-accent"
      />

      <div className="flex-1" />

      {/* Device toggle */}
      <DeviceToggle />

      {/* Zoom controls */}
      <ZoomControls />

      {/* Undo/Redo */}
      <button
        onClick={() => store.undo()}
        disabled={!store.canUndo}
        className={clsx(
          'p-2 rounded transition-colors text-text-secondary',
          store.canUndo ? 'hover:bg-midnight-3 hover:text-text-primary' : 'opacity-30 cursor-not-allowed'
        )}
        title="Undo (Cmd+Z)"
      >
        <Undo size={18} />
      </button>
      <button
        onClick={() => store.redo()}
        disabled={!store.canRedo}
        className={clsx(
          'p-2 rounded transition-colors text-text-secondary',
          store.canRedo ? 'hover:bg-midnight-3 hover:text-text-primary' : 'opacity-30 cursor-not-allowed'
        )}
        title="Redo (Cmd+Shift+Z)"
      >
        <Redo size={18} />
      </button>

      {/* Export button */}
      {onExport && (
        <button
          onClick={onExport}
          className="px-3 py-1.5 bg-midnight-3 hover:bg-midnight-4 text-text-secondary hover:text-text-primary rounded text-sm flex items-center gap-2 transition-colors"
        >
          <Download size={16} />
          Export
        </button>
      )}

      {/* Save button */}
      {onSave && (
        <button
          onClick={onSave}
          className="px-4 py-1.5 bg-accent hover:bg-accent-hover text-white rounded text-sm flex items-center gap-2 transition-colors"
        >
          <Save size={16} />
          Save
        </button>
      )}
    </div>
  );
});

const DeviceToggle = observer(function DeviceToggle() {
  const { editorUI } = useStore();

  return (
    <div className="flex items-center gap-1 bg-midnight-3 rounded-lg p-1">
      <button
        onClick={() => editorUI.setPreviewDevice('desktop')}
        className={clsx(
          'p-1.5 rounded transition-colors',
          editorUI.previewDevice === 'desktop'
            ? 'bg-midnight-4 text-text-primary shadow-sm'
            : 'text-text-secondary hover:text-text-primary'
        )}
        title="Desktop preview"
      >
        <Monitor size={16} />
      </button>
      <button
        onClick={() => editorUI.setPreviewDevice('mobile')}
        className={clsx(
          'p-1.5 rounded transition-colors',
          editorUI.previewDevice === 'mobile'
            ? 'bg-midnight-4 text-text-primary shadow-sm'
            : 'text-text-secondary hover:text-text-primary'
        )}
        title="Mobile preview"
      >
        <Smartphone size={16} />
      </button>
    </div>
  );
});

const ZoomControls = observer(function ZoomControls() {
  const { editorUI } = useStore();

  return (
    <div className="flex items-center gap-1">
      <button
        onClick={() => editorUI.zoomOut()}
        className="p-1.5 hover:bg-midnight-3 rounded text-text-secondary hover:text-text-primary transition-colors"
        title="Zoom out"
      >
        <ZoomOut size={16} />
      </button>
      <span className="text-sm text-text-secondary w-12 text-center">
        {editorUI.zoomPercentage}%
      </span>
      <button
        onClick={() => editorUI.zoomIn()}
        className="p-1.5 hover:bg-midnight-3 rounded text-text-secondary hover:text-text-primary transition-colors"
        title="Zoom in"
      >
        <ZoomIn size={16} />
      </button>
    </div>
  );
});

// === Utility Functions ===

function useKeyboardShortcuts(store: RootStoreInstance) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Undo/Redo
      if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
        e.preventDefault();
        e.shiftKey ? store.redo() : store.undo();
      }

      // Delete
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const activeEl = document.activeElement;
        if (activeEl?.tagName !== 'INPUT' && activeEl?.tagName !== 'TEXTAREA') {
          if (store.editorUI.selectedBlockId) {
            e.preventDefault();
            store.template.deleteBlock(store.editorUI.selectedBlockId);
            store.editorUI.clearSelection();
          }
        }
      }

      // Escape
      if (e.key === 'Escape') {
        store.editorUI.clearSelection();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [store]);
}

function handleDrop(
  active: any,
  over: any,
  template: any,
  blockRegistry: BlockRegistryImpl,
  prebuiltRegistry: PrebuiltTemplateRegistry | undefined,
  editorUI: any
) {
  // Handle template drop
  const templateId = active.data.current?.templateId as string;
  if (templateId && prebuiltRegistry) {
    const prebuilt = prebuiltRegistry.get(templateId);
    if (prebuilt) {
      const newSection = cloneSectionWithNewIds(prebuilt.section);
      template.addSection(newSection);
      editorUI.selectSection(newSection.id);
      return;
    }
  }

  // Handle block drop
  const blockType = active.data.current?.blockType as string;
  if (!blockType) return;

  const definition = blockRegistry.get(blockType);
  if (!definition) return;

  const newBlock: BlockSnapshotIn = {
    id: nanoid(),
    type: blockType as BlockType,
    ...definition.defaultProps,
  };

  if (!over) {
    // No target - add to last section or create new
    if (template.sections.length === 0) {
      const section = createSection();
      template.addSection(section);
      template.insertBlock(template.sections[0].columns[0].id, newBlock, 0);
    } else {
      const lastSection = template.sections[template.sections.length - 1];
      const lastColumn = lastSection.columns[0];
      template.insertBlock(lastColumn.id, newBlock, lastColumn.blocks.length);
    }
  } else {
    const dropId = over.id.toString();

    if (dropId === 'drop-empty') {
      const section = createSection();
      template.addSection(section);
      template.insertBlock(template.sections[0].columns[0].id, newBlock, 0);
    } else if (dropId.startsWith('drop-subcolumn-')) {
      // Format: drop-subcolumn-<subColumnId>-<index>
      const m = dropId.match(/^drop-subcolumn-(.+)-(\d+)$/);
      if (m) {
        const [, subColumnId, indexStr] = m;
        const index = parseInt(indexStr, 10);
        if (!isLeafBlockType(blockType as any)) {
          // Container blocks are not allowed inside sub-columns; bail silently.
          return;
        }
        // Walk the template to find the sub-column instance.
        let target: any = undefined;
        for (const section of template.sections) {
          for (const col of section.columns) {
            const sc = (col.subColumns ?? []).find?.((s: any) => s.id === subColumnId);
            if (sc) { target = sc; break; }
          }
          if (target) break;
        }
        if (target) {
          target.addBlock(newBlock, index);
          editorUI.selectBlock(newBlock.id);
          return;
        }
      }
    } else if (dropId.startsWith('drop-column-')) {
      const columnId = dropId.replace('drop-column-', '').replace('-end', '');
      const column = template.findColumnById(columnId);
      if (column) {
        template.insertBlock(columnId, newBlock, column.blocks.length);
      }
    } else if (editorUI.dropIntent) {
      // dropIntent may target a column or a sub-column; the sub-column path
      // is handled above, so this fallback is the column path.
      if (editorUI.dropIntent.targetColumnId) {
        template.insertBlock(
          editorUI.dropIntent.targetColumnId,
          newBlock,
          editorUI.dropIntent.targetIndex
        );
      }
    }
  }

  editorUI.selectBlock(newBlock.id);
}

function cloneSectionWithNewIds(section: any): SectionSnapshotIn {
  return {
    ...section,
    id: nanoid(),
    columns: section.columns.map((col: any) => ({
      ...col,
      id: nanoid(),
      blocks: col.blocks.map((block: any) => ({
        ...block,
        id: nanoid(),
      })),
    })),
  };
}
