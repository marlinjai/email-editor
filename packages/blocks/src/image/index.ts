// packages/blocks/src/image/index.ts
// Image block

import type { BlockDefinition, ImageBlock } from '@marlinjai/email-editor-core';
import { ImageBlockSchema } from '@marlinjai/email-editor-core';

/**
 * Image block definition
 */
export const imageBlockDefinition: BlockDefinition<ImageBlock> = {
  type: 'image',
  label: 'Image',
  category: 'media',
  description: 'Insert an image',
  defaultProps: {
    src: 'https://placehold.co/600x400',
    alt: 'Placeholder image',
    align: 'center',
    width: '600px',
  },
  propSchema: ImageBlockSchema.omit({ id: true, type: true }),
  toMJML: (block) => {
    const attrs: string[] = [`src="${block.src}"`, `data-block-id="${block.id}"`];

    if (block.alt) attrs.push(`alt="${block.alt}"`);
    if (block.width) attrs.push(`width="${block.width}"`);
    if (block.height) attrs.push(`height="${block.height}"`);
    if (block.align) attrs.push(`align="${block.align}"`);
    if (block.href) attrs.push(`href="${block.href}"`);
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

    return `<mj-image ${attrs.join(' ')} css-class="el-image el-${block.id}" />`;
  },
};

