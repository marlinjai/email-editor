// packages/blocks/src/button/index.ts
// Button block

import type { BlockDefinition, ButtonBlock } from '@marlinjai/email-editor-core';
import { ButtonBlockSchema } from '@marlinjai/email-editor-core';

/**
 * Button block definition
 */
export const buttonBlockDefinition: BlockDefinition<ButtonBlock> = {
  type: 'button',
  label: 'Button',
  category: 'media',
  description: 'Call-to-action button',
  defaultProps: {
    label: 'Click Here',
    href: 'https://example.com',
    align: 'center',
    backgroundColor: '#944923',
    color: '#ffffff',
    borderRadius: '4px',
    innerPadding: '12px 24px',
  },
  propSchema: ButtonBlockSchema.omit({ id: true, type: true }),
  toMJML: (block) => {
    const attrs: string[] = [`href="${block.href}"`, `data-block-id="${block.id}"`];

    if (block.align) attrs.push(`align="${block.align}"`);
    if (block.backgroundColor) attrs.push(`background-color="${block.backgroundColor}"`);
    if (block.color) attrs.push(`color="${block.color}"`);
    if (block.borderRadius) attrs.push(`border-radius="${block.borderRadius}"`);
    if (block.innerPadding) attrs.push(`inner-padding="${block.innerPadding}"`);
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

    return `<mj-button ${attrs.join(' ')} css-class="el-button el-${block.id}">${block.label}</mj-button>`;
  },
};

