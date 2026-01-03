// packages/ui/src/EmailEditor.tsx
// Main email editor component with 3-panel layout

import { useState, useEffect } from 'react';
import { DndContext, DragEndEvent, DragOverlay } from '@dnd-kit/core';
import { Undo, Redo, Save } from 'lucide-react';
import {
  EmailTemplate,
  Block,
  createHistoryManager,
  BlockRegistryImpl,
} from '@returnhypnosis/email-editor-core';
import { Canvas } from './canvas';
import { BlockToolbar } from './toolbar';
import { PropertyInspector } from './inspector';
import { nanoid } from 'nanoid';
import clsx from 'clsx';

interface EmailEditorProps {
  value: EmailTemplate;
  onChange: (template: EmailTemplate) => void;
  blockRegistry: BlockRegistryImpl;
  onSave?: () => void;
  compiler?: { compile: (template: EmailTemplate) => { html: string } };
}

/**
 * Main email editor component
 * 3-panel layout: Toolbar | Canvas | Inspector
 */
export function EmailEditor({
  value,
  onChange,
  blockRegistry,
  onSave,
  compiler,
}: EmailEditorProps) {
  const [template, setTemplate] = useState(value);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [compiledHtml, setCompiledHtml] = useState('');
  const [history] = useState(() => createHistoryManager(value));

  // Compile template to HTML whenever it changes
  useEffect(() => {
    if (compiler) {
      const result = compiler.compile(template);
      setCompiledHtml(result.html);
    } else {
      // Fallback or just empty
      setCompiledHtml('<!-- MJML compiler not available in browser -->');
    }
  }, [template, compiler]);

  // Update parent when template changes
  useEffect(() => {
    onChange(template);
  }, [template, onChange]);

  // Handle undo
  const handleUndo = () => {
    const prevState = history.undo();
    if (prevState) {
      setTemplate(prevState);
    }
  };

  // Handle redo
  const handleRedo = () => {
    const nextState = history.redo();
    if (nextState) {
      setTemplate(nextState);
    }
  };

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          handleRedo();
        } else {
          handleUndo();
        }
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedBlockId && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
          e.preventDefault();
          handleDeleteBlock();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedBlockId]);

  // Handle block drag end
  const handleDragEnd = (event: DragEndEvent) => {
    const { active } = event;
    const blockType = active.data.current?.blockType as string;

    if (!blockType) return;

    const definition = blockRegistry.get(blockType);
    if (!definition) return;

    // Create new block with default props
    const newBlock: Block = {
      id: nanoid(),
      type: blockType,
      ...definition.defaultProps,
    } as Block;

    // Add block to first section's first column
    // TODO: Make this more sophisticated with drop zones
    const newTemplate = history.updateState((draft) => {
      if (draft.sections.length === 0) {
        draft.sections.push({
          id: nanoid(),
          type: 'section',
          columns: [{ id: nanoid(), blocks: [newBlock] }],
        });
      } else {
        draft.sections[0].columns[0].blocks.push(newBlock);
      }
    });

    setTemplate(newTemplate);
    setSelectedBlockId(newBlock.id);
  };

  // Handle block selection
  const handleBlockClick = (blockId: string) => {
    setSelectedBlockId(blockId);
  };

  // Find selected block
  const selectedBlock = template.sections
    .flatMap((s) => s.columns)
    .flatMap((c) => c.blocks)
    .find((b) => b.id === selectedBlockId) || null;

  // Handle block property update
  const handleBlockUpdate = (updates: Partial<Block>) => {
    if (!selectedBlockId) return;

    const newTemplate = history.updateState((draft) => {
      for (const section of draft.sections) {
        for (const column of section.columns) {
          const block = column.blocks.find((b) => b.id === selectedBlockId);
          if (block) {
            Object.assign(block, updates);
            break;
          }
        }
      }
    });

    setTemplate(newTemplate);
  };

  // Handle block deletion
  const handleDeleteBlock = () => {
    if (!selectedBlockId) return;

    const newTemplate = history.updateState((draft) => {
      for (const section of draft.sections) {
        for (const column of section.columns) {
          const index = column.blocks.findIndex((b) => b.id === selectedBlockId);
          if (index !== -1) {
            column.blocks.splice(index, 1);
            break;
          }
        }
      }
    });

    setTemplate(newTemplate);
    setSelectedBlockId(null);
  };

  return (
    <DndContext onDragEnd={handleDragEnd}>
      <div className="email-editor">
        {/* Top toolbar */}
        <div className="bg-white border-b border-brand-border px-4 py-2 flex items-center gap-4">
          <h1 className="text-xl font-semibold font-serif">Email Editor</h1>
          <div className="flex-1" />

          {/* Undo/Redo */}
          <button
            onClick={handleUndo}
            disabled={!history.canUndo()}
            className={clsx(
              'p-2 rounded transition-colors',
              history.canUndo()
                ? 'hover:bg-gray-100'
                : 'opacity-30 cursor-not-allowed'
            )}
            title="Undo (Cmd+Z)"
          >
            <Undo size={18} />
          </button>
          <button
            onClick={handleRedo}
            disabled={!history.canRedo()}
            className={clsx(
              'p-2 rounded transition-colors',
              history.canRedo()
                ? 'hover:bg-gray-100'
                : 'opacity-30 cursor-not-allowed'
            )}
            title="Redo (Cmd+Shift+Z)"
          >
            <Redo size={18} />
          </button>

          {/* Save button */}
          {onSave && (
            <button
              onClick={onSave}
              className="btn btn-primary flex items-center gap-2"
            >
              <Save size={16} />
              Save
            </button>
          )}
        </div>

        {/* 3-panel layout */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left: Block toolbar */}
          <BlockToolbar blocks={blockRegistry.getAll()} />

          {/* Center: Canvas */}
          <Canvas
            html={compiledHtml}
            selectedBlockId={selectedBlockId}
            onBlockClick={handleBlockClick}
          />

          {/* Right: Property inspector */}
          <PropertyInspector
            block={selectedBlock}
            onChange={handleBlockUpdate}
            onDelete={handleDeleteBlock}
          />
        </div>
      </div>

      {/* Drag overlay */}
      <DragOverlay>
        <div className="bg-white p-3 rounded border-2 border-brand-primary shadow-lg">
          Dragging block...
        </div>
      </DragOverlay>
    </DndContext>
  );
}

