// packages/ui/src/sidebar/ElementsPanel.tsx
// Elements panel showing base MJML blocks

import { useDraggable } from '@dnd-kit/core';
import { Type, Image, Square, Minus, Space, Share2, List, Code } from 'lucide-react';
import type { BlockDefinition } from '@marlinjai/email-editor-core';
import clsx from 'clsx';

interface ElementsPanelProps {
  blocks: BlockDefinition[];
}

/**
 * Panel showing draggable base elements (MJML blocks)
 * Matches Mailjet's "Elements > Content" panel
 */
export function ElementsPanel({ blocks }: ElementsPanelProps) {
  // Filter out branded/locked blocks - show only base elements
  const contentBlocks = blocks.filter(
    (b) => b.category !== 'brand' && b.type !== 'header' && b.type !== 'footer'
  );

  return (
    <div className="p-4">
      <h3 className="text-sm font-semibold text-gray-600 mb-3 uppercase tracking-wide">
        Content
      </h3>
      <div className="grid grid-cols-2 gap-2">
        {contentBlocks.map((block) => (
          <ElementItem key={block.type} definition={block} />
        ))}
      </div>
    </div>
  );
}

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
      <Icon size={24} className="text-gray-500 mb-1" />
      <span className="text-xs text-gray-700 text-center">{definition.label}</span>
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

