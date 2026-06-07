// packages/ui/src/sidebar/ElementsPanel.tsx
// Elements panel showing base MJML blocks

import React from 'react';
import { observer } from 'mobx-react-lite';
import { useDraggable } from '@dnd-kit/core';
import { Type, Image, Square, Minus, Space, Share2, List, Code } from 'lucide-react';
import { isLeafBlockType, type BlockDefinition, type BlockType } from '@marlinjai/email-editor-core';
import clsx from 'clsx';
import { useStore } from '../store';

interface ElementsPanelProps {
  blocks: BlockDefinition[];
}

/**
 * Panel showing draggable base elements (MJML blocks)
 * Matches Mailjet's "Elements > Content" panel
 */
export const ElementsPanel = observer(function ElementsPanel({ blocks }: ElementsPanelProps) {
  const { editorUI } = useStore();
  // When a sub-column is the active context, container blocks are
  // hidden because they would compound table nesting beyond the
  // 85-90% client tier's safe rendering depth.
  const isSubColumnContext = !!editorUI.selectedSubColumnId;

  // Filter out branded/locked blocks - show only base elements
  let contentBlocks = blocks.filter(
    (b) => b.category !== 'brand' && b.type !== 'header' && b.type !== 'footer'
  );
  if (isSubColumnContext) {
    contentBlocks = contentBlocks.filter((b) => isLeafBlockType(b.type as BlockType));
  }

  return (
    <div className="p-4">
      <h3 className="text-sm font-semibold text-text-dark-muted mb-3 uppercase tracking-wide">
        Content
      </h3>
      {isSubColumnContext && (
        <p className="text-[10px] text-amber-700/80 mb-2 leading-snug">
          Container blocks (hero, carousel, footer…) are hidden inside sub-columns to keep the email render-safe.
        </p>
      )}
      <div className="grid grid-cols-2 gap-2">
        {contentBlocks.map((block) => (
          <ElementItem key={block.type} definition={block} />
        ))}
      </div>
    </div>
  );
});

/**
 * Single draggable element item
 */
function ElementItem({ definition }: { definition: BlockDefinition }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `element-${definition.type}`,
    data: { blockType: definition.type },
  });

  const Icon = getElementIcon(definition.type);

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={clsx(
        'flex flex-col items-center justify-center p-3 rounded-lg border border-brand-border',
        'cursor-grab active:cursor-grabbing transition-all',
        'hover:border-brand-primary hover:bg-brand-primary/5',
        isDragging && 'opacity-50 border-brand-primary'
      )}
    >
      <Icon size={24} className="text-text-dark-muted mb-1" />
      <span className="text-xs text-text-dark text-center">{definition.label}</span>
    </div>
  );
}

/**
 * Get icon for element type
 */
function getElementIcon(type: string) {
  switch (type) {
    case 'text':
      return Type;
    case 'image':
      return Image;
    case 'button':
      return Square;
    case 'divider':
      return Minus;
    case 'spacer':
      return Space;
    case 'social':
      return Share2;
    case 'accordion':
      return List;
    case 'raw':
      return Code;
    case 'hero':
      return Image;
    default:
      return Square;
  }
}
