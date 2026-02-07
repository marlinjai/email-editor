// packages/blocks/src/raw/index.ts
// Raw HTML block for custom code

import type { BlockDefinition, RawBlock } from '@returnhypnosis/email-editor-core';
import { RawBlockSchema } from '@returnhypnosis/email-editor-core';

/**
 * Raw HTML block definition
 * Maps to MJML's <mj-raw> component
 */
export const rawBlockDefinition: BlockDefinition<RawBlock> = {
  type: 'raw',
  label: 'HTML Block',
  category: 'layout',
  description: 'Custom HTML code',
  defaultProps: {
    html: '<!-- Custom HTML here -->',
  },
  propSchema: RawBlockSchema.omit({ id: true, type: true }),
  toMJML: (block) => {
    return `<mj-raw css-class="el-raw el-${block.id}">${block.html}</mj-raw>`;
  },
};

