// packages/ui/src/toolbar/BlockItem.tsx
// Individual draggable block item

import { useDraggable } from '@dnd-kit/core';
import { Type, Image, Square, Minus, Space } from 'lucide-react';
import type { BlockDefinition } from '@returnhypnosis/email-editor-core';
import clsx from 'clsx';

interface BlockItemProps {
  definition: BlockDefinition;
}

/**
 * Get icon component for block type
 */
function getBlockIcon(type: string) {
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
    default:
      return Square;
  }
}

/**
 * Draggable block item in toolbar
 */
export function BlockItem({ definition }: BlockItemProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: definition.type,
    data: { blockType: definition.type },
  });

  const Icon = getBlockIcon(definition.type);

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={clsx(
        'flex items-center gap-3 p-3 rounded border border-brand-border',
        'cursor-grab active:cursor-grabbing transition-all',
        'hover:bg-gray-50 hover:border-brand-primary',
        isDragging && 'opacity-50'
      )}
    >
      <Icon size={20} className="text-brand-primary" />
      <div className="flex-1">
        <div className="font-medium text-sm">{definition.label}</div>
        {definition.description && (
          <div className="text-xs text-brand-text-secondary mt-0.5">
            {definition.description}
          </div>
        )}
      </div>
    </div>
  );
}

