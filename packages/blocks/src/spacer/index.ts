// packages/blocks/src/spacer/index.ts
// Spacer block

import type { BlockDefinition, SpacerBlock } from '@marlinjai/email-editor-core';
import { SpacerBlockSchema } from '@marlinjai/email-editor-core';

/**
 * Spacer block definition
 */
export const spacerBlockDefinition: BlockDefinition<SpacerBlock> = {
  type: 'spacer',
  label: 'Spacer',
  category: 'layout',
  description: 'Vertical spacing',
  defaultProps: {
    height: '20px',
  },
  propSchema: SpacerBlockSchema.omit({ id: true, type: true }),
  toMJML: (block) => {
    return `<mj-spacer height="${block.height}" css-class="el-spacer el-${block.id}" />`;
  },
};

