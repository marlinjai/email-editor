// packages/blocks/src/table/index.ts
// Table block for data display
// Maps to MJML's <mj-table> component

import type { BlockDefinition, TableBlock } from '@returnhypnosis/email-editor-core';
import { TableBlockSchema } from '@returnhypnosis/email-editor-core';

/**
 * Table block definition
 * Creates a data table for displaying structured information
 */
export const tableBlockDefinition: BlockDefinition<TableBlock> = {
  type: 'table',
  label: 'Table',
  category: 'text',
  description: 'Data table with rows and columns',
  defaultProps: {
    headers: ['Column 1', 'Column 2', 'Column 3'],
    rows: [
      ['Data 1', 'Data 2', 'Data 3'],
      ['Data 4', 'Data 5', 'Data 6'],
    ],
    align: 'left',
    color: '#000000',
    fontSize: '14px',
    cellpadding: '8px',
  },
  propSchema: TableBlockSchema.omit({ id: true, type: true }),
  toMJML: (block) => {
    const attrs: string[] = [`css-class="el-table el-${block.id}"`];

    if (block.align) attrs.push(`align="${block.align}"`);
    if (block.color) attrs.push(`color="${block.color}"`);
    if (block.fontFamily) attrs.push(`font-family="${block.fontFamily}"`);
    if (block.fontSize) attrs.push(`font-size="${block.fontSize}"`);
    if (block.cellpadding) attrs.push(`cellpadding="${block.cellpadding}"`);
    if (block.cellspacing) attrs.push(`cellspacing="${block.cellspacing}"`);
    if (block.border) attrs.push(`border="${block.border}"`);
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

    // Generate header row
    const headerCells = block.headers
      .map((h) => `<th style="padding: 8px; border-bottom: 1px solid #ddd; text-align: left;">${h}</th>`)
      .join('');
    const headerRow = `<tr style="background-color: #f5f5f5;">${headerCells}</tr>`;

    // Generate data rows
    const dataRows = block.rows
      .map((row) => {
        const cells = row
          .map((cell) => `<td style="padding: 8px; border-bottom: 1px solid #eee;">${cell}</td>`)
          .join('');
        return `<tr>${cells}</tr>`;
      })
      .join('\n      ');

    return `
<mj-table ${attrs.join(' ')}>
      ${headerRow}
      ${dataRows}
</mj-table>
    `.trim();
  },
};

