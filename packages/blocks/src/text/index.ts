// packages/blocks/src/text/index.ts
// Text block with TipTap

import { z } from 'zod';
import type { BlockDefinition, TextBlock } from '@returnhypnosis/email-editor-core';
import { TextBlockSchema } from '@returnhypnosis/email-editor-core';

/**
 * Text block definition
 * Uses TipTap for rich text editing
 */
export const textBlockDefinition: BlockDefinition<TextBlock> = {
  type: 'text',
  label: 'Text',
  category: 'text',
  description: 'Rich text content',
  defaultProps: {
    content: '<p>Enter your text here...</p>',
    align: 'left',
    color: '#000000',
    fontSize: '14px',
    fontFamily: 'Georgia, serif',
  },
  propSchema: TextBlockSchema.omit({ id: true, type: true }),
  toMJML: (block) => {
    const attrs: string[] = [];

    if (block.align) attrs.push(`align="${block.align}"`);
    if (block.color) attrs.push(`color="${block.color}"`);
    if (block.fontSize) attrs.push(`font-size="${block.fontSize}"`);
    if (block.fontFamily) attrs.push(`font-family="${block.fontFamily}"`);
    if (block.lineHeight) attrs.push(`line-height="${block.lineHeight}"`);
    if (block.padding) {
      const padding = [
        block.padding.top,
        block.padding.right,
        block.padding.bottom,
        block.padding.left,
      ]
        .filter(Boolean)
        .join(' ');
      if (padding) attrs.push(`padding="${padding}"`);
    }

    return `<mj-text ${attrs.join(' ')} data-block-id="${block.id}">${block.content}</mj-text>`;
  },
};

