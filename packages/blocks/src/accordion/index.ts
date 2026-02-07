// packages/blocks/src/accordion/index.ts
// Accordion block with collapsible items

import type { BlockDefinition, AccordionBlock } from '@returnhypnosis/email-editor-core';
import { AccordionBlockSchema } from '@returnhypnosis/email-editor-core';

/**
 * Accordion block definition
 * Maps to MJML's <mj-accordion> component
 */
export const accordionBlockDefinition: BlockDefinition<AccordionBlock> = {
  type: 'accordion',
  label: 'Accordion',
  category: 'text',
  description: 'Collapsible FAQ sections',
  defaultProps: {
    items: [
      { title: 'Question 1', content: 'Answer to question 1' },
      { title: 'Question 2', content: 'Answer to question 2' },
    ],
    iconPosition: 'right',
    borderColor: '#e0e0e0',
  },
  propSchema: AccordionBlockSchema.omit({ id: true, type: true }),
  toMJML: (block) => {
    const attrs: string[] = [`css-class="el-accordion el-${block.id}"`];

    if (block.iconPosition) attrs.push(`icon-position="${block.iconPosition}"`);
    if (block.borderColor) attrs.push(`border="${block.borderColor}"`);
    if (block.fontFamily) attrs.push(`font-family="${block.fontFamily}"`);

    const items = block.items
      .map(
        (item) => `
  <mj-accordion-element>
    <mj-accordion-title>${item.title}</mj-accordion-title>
    <mj-accordion-text>${item.content}</mj-accordion-text>
  </mj-accordion-element>`
      )
      .join('\n');

    return `
<mj-accordion ${attrs.join(' ')}>
${items}
</mj-accordion>
    `.trim();
  },
};

