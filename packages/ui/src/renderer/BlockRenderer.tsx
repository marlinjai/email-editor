// packages/ui/src/renderer/BlockRenderer.tsx
import React from 'react';
import { observer } from 'mobx-react-lite';
import clsx from 'clsx';
import { BlockType, type BlockInstance } from '@marlinjai/email-editor-core';
import { useStore } from '../store';
import { TextBlock } from './blocks/TextBlock';
import { ImageBlock } from './blocks/ImageBlock';
import { ButtonBlock } from './blocks/ButtonBlock';
import { DividerBlock } from './blocks/DividerBlock';
import { SpacerBlock } from './blocks/SpacerBlock';
import { SocialBlock } from './blocks/SocialBlock';
import { HeroBlock } from './blocks/HeroBlock';
import { RawBlock } from './blocks/RawBlock';

/**
 * Block component map - routes block types to their renderers
 */
const BLOCK_COMPONENTS: Record<string, React.ComponentType<{ block: BlockInstance }>> = {
  [BlockType.TEXT]: TextBlock,
  [BlockType.IMAGE]: ImageBlock,
  [BlockType.BUTTON]: ButtonBlock,
  [BlockType.DIVIDER]: DividerBlock,
  [BlockType.SPACER]: SpacerBlock,
  [BlockType.SOCIAL]: SocialBlock,
  [BlockType.HERO]: HeroBlock,
  [BlockType.RAW]: RawBlock,
  // Additional blocks can be added here
  // [BlockType.ACCORDION]: AccordionBlock,
  // [BlockType.NAVBAR]: NavbarBlock,
  // [BlockType.CAROUSEL]: CarouselBlock,
  // [BlockType.TABLE]: TableBlock,
  // [BlockType.HEADER]: HeaderBlock,
  // [BlockType.FOOTER]: FooterBlock,
};

interface BlockRendererProps {
  block: BlockInstance;
  /** Whether this block is in inline editing mode */
  isEditing?: boolean;
}

/**
 * BlockRenderer - Routes blocks to their specific renderer components
 *
 * Key features:
 * - Wraps blocks with selection/hover UI
 * - Handles click to select
 * - Shows hidden block placeholder
 * - Routes to appropriate block renderer
 */
export const BlockRenderer = observer(({ block, isEditing = false }: BlockRendererProps) => {
  const { editorUI } = useStore();
  const isSelected = editorUI.selectedBlockId === block.id;
  const isHovered = editorUI.hoverBlockId === block.id && !isSelected;

  // Handle hidden blocks
  if (block.hidden) {
    return (
      <div
        className={clsx(
          'hidden-block-placeholder',
          'px-3 py-2 bg-gray-100 border border-dashed border-gray-300 rounded',
          'text-gray-400 text-sm flex items-center gap-2 cursor-pointer',
          isSelected && 'ring-2 ring-blue-500'
        )}
        onClick={(e) => {
          e.stopPropagation();
          editorUI.selectBlock(block.id);
        }}
      >
        <span className="opacity-50">👁️‍🗨️</span>
        <span>{block.displayName} (hidden)</span>
      </div>
    );
  }

  // Get the appropriate renderer component
  const Component = BLOCK_COMPONENTS[block.type];

  // Unknown block type fallback
  if (!Component) {
    return (
      <div
        className="unknown-block px-3 py-2 bg-yellow-50 border border-yellow-200 rounded text-yellow-700 text-sm"
        onClick={(e) => {
          e.stopPropagation();
          editorUI.selectBlock(block.id);
        }}
      >
        Unknown block type: {block.type}
      </div>
    );
  }

  return (
    <div
      className={clsx(
        'email-block relative',
        // Selection ring
        isSelected && 'ring-2 ring-blue-500 ring-offset-1',
        // Hover ring (only when not selected)
        isHovered && 'ring-1 ring-blue-300',
        // Cursor for non-editing state
        !isEditing && 'cursor-pointer',
        // Locked block styling
        block.isLocked && 'opacity-75'
      )}
      data-block-id={block.id}
      data-block-type={block.type}
      onClick={(e) => {
        if (isEditing) return; // Don't change selection during inline edit
        e.stopPropagation();
        editorUI.selectBlock(block.id);
      }}
      onDoubleClick={(e) => {
        // Enable inline editing for text blocks
        if (block.type === BlockType.TEXT) {
          e.stopPropagation();
          editorUI.startInlineEdit(block.id);
        }
      }}
      onMouseEnter={() => {
        if (!editorUI.isDragging) {
          editorUI.setHoverBlock(block.id);
        }
      }}
      onMouseLeave={() => {
        editorUI.setHoverBlock(undefined);
      }}
    >
      {/* Block type label (shown on hover/selection) */}
      {(isSelected || isHovered) && (
        <div
          className={clsx(
            'absolute -top-5 left-0 px-1.5 py-0.5 text-xs font-medium rounded-t',
            isSelected ? 'bg-blue-500 text-white' : 'bg-blue-100 text-blue-700'
          )}
        >
          {block.displayName}
        </div>
      )}

      {/* Locked indicator */}
      {block.isLocked && (
        <div className="absolute top-1 right-1 text-gray-400" title="This block is locked">
          🔒
        </div>
      )}

      {/* Render the actual block content */}
      <Component block={block} />
    </div>
  );
});

BlockRenderer.displayName = 'BlockRenderer';
