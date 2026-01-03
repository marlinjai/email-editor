// packages/blocks/src/divider/index.ts
// Divider block

import type { BlockDefinition, DividerBlock } from '@returnhypnosis/email-editor-core';
import { DividerBlockSchema } from '@returnhypnosis/email-editor-core';

/**
 * Divider block definition
 */
export const dividerBlockDefinition: BlockDefinition<DividerBlock> = {
  type: 'divider',
  label: 'Divider',
  category: 'layout',
  description: 'Horizontal divider line',
  defaultProps: {
    borderColor: '#cccccc',
    borderWidth: '1px',
    borderStyle: 'solid',
  },
  propSchema: DividerBlockSchema.omit({ id: true, type: true }),
  toMJML: (block) => {
    const attrs: string[] = [`data-block-id="${block.id}"`];

    if (block.borderColor) attrs.push(`border-color="${block.borderColor}"`);
    if (block.borderWidth) attrs.push(`border-width="${block.borderWidth}"`);
    if (block.borderStyle) attrs.push(`border-style="${block.borderStyle}"`);
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

    return `<mj-divider ${attrs.join(' ')} />`;
  },
};

