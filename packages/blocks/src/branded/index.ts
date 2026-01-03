// packages/blocks/src/branded/index.ts
// ReTurn branded blocks (header and footer)

import { z } from 'zod';
import type { BlockDefinition, HeaderBlock, FooterBlock } from '@returnhypnosis/email-editor-core';
import { HeaderBlockSchema, FooterBlockSchema } from '@returnhypnosis/email-editor-core';

/**
 * ReTurn branded header block
 * Locked - cannot be edited
 */
export const headerBlockDefinition: BlockDefinition<HeaderBlock> = {
  type: 'header',
  label: 'ReTurn Header',
  category: 'brand',
  description: 'Branded newsletter header',
  locked: true,
  defaultProps: {
    locked: true,
  },
  propSchema: HeaderBlockSchema.omit({ id: true, type: true }),
  toMJML: (block) => {
    return `
<mj-wrapper background-color="#ffffff" padding="20px" data-block-id="${block.id}">
  <mj-section>
    <mj-column>
      <mj-image src="https://via.placeholder.com/70x70" width="70px" align="center" />
      <mj-text align="center" font-size="24px" color="#944923" font-family="Georgia, serif">
        Welcome to the ReTurn Newsletter
      </mj-text>
    </mj-column>
  </mj-section>
</mj-wrapper>
    `.trim();
  },
};

/**
 * ReTurn branded footer block
 * Locked - cannot be edited
 */
export const footerBlockDefinition: BlockDefinition<FooterBlock> = {
  type: 'footer',
  label: 'ReTurn Footer',
  category: 'brand',
  description: 'Branded newsletter footer',
  locked: true,
  defaultProps: {
    locked: true,
  },
  propSchema: FooterBlockSchema.omit({ id: true, type: true }),
  toMJML: (block) => {
    return `
<mj-wrapper background-color="#f5f5f5" padding="20px" data-block-id="${block.id}">
  <mj-section>
    <mj-column>
      <mj-text align="center" font-size="12px" color="#666666">
        © ${new Date().getFullYear()} ReTurn Hypnosis. All rights reserved.
      </mj-text>
      <mj-text align="center" font-size="12px" color="#666666">
        <a href="{{unsubscribe_url}}" style="color: #944923; text-decoration: underline;">Unsubscribe</a>
      </mj-text>
    </mj-column>
  </mj-section>
</mj-wrapper>
    `.trim();
  },
};

