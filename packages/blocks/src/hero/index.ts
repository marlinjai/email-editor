// packages/blocks/src/hero/index.ts
// Hero section block

import type { BlockDefinition, HeroBlock } from '@returnhypnosis/email-editor-core';
import { HeroBlockSchema } from '@returnhypnosis/email-editor-core';

/**
 * Hero block definition
 */
export const heroBlockDefinition: BlockDefinition<HeroBlock> = {
  type: 'hero',
  label: 'Hero',
  category: 'layout',
  description: 'Full-width hero with background',
  defaultProps: {
    backgroundImage: 'https://placehold.co/1200x600',
    backgroundHeight: '400px',
    backgroundColor: '#944923',
    verticalAlign: 'middle',
    mode: 'fluid-height',
  },
  propSchema: HeroBlockSchema.omit({ id: true, type: true }),
  toMJML: (block) => {
    const attrs: string[] = [
      `background-url="${block.backgroundImage}"`,
      `css-class="el-hero el-${block.id}"`,
    ];

    if (block.backgroundHeight) attrs.push(`background-height="${block.backgroundHeight}"`);
    if (block.backgroundWidth) attrs.push(`background-width="${block.backgroundWidth}"`);
    if (block.backgroundColor) attrs.push(`background-color="${block.backgroundColor}"`);
    if (block.verticalAlign) attrs.push(`vertical-align="${block.verticalAlign}"`);
    if (block.mode) attrs.push(`mode="${block.mode}"`);

    return `
<mj-hero ${attrs.join(' ')}>
  <mj-text align="center" color="#ffffff" font-size="32px" font-weight="bold">
    Hero Title
  </mj-text>
  <mj-text align="center" color="#ffffff" font-size="16px">
    Add your hero content here
  </mj-text>
</mj-hero>
    `.trim();
  },
};

