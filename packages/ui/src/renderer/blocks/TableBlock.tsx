// packages/ui/src/renderer/blocks/TableBlock.tsx
import React from 'react';
import { observer } from 'mobx-react-lite';
import type { BlockInstance } from '@marlinjai/email-editor-core';

interface TableBlockProps {
  block: BlockInstance;
}

export const TableBlock = observer(({ block }: TableBlockProps) => {
  if (block.headers.length === 0 && block.rows.length === 0) {
    return (
      <div className="table-block" style={{ padding: '12px', color: '#6b7280', fontSize: '14px' }}>
        Empty table
      </div>
    );
  }

  const cellPad = block.cellpadding || '8px';

  return (
    <div className="table-block" style={block.computedStyle as React.CSSProperties}>
      <table
        style={{
          width: '100%',
          borderCollapse: block.cellspacing ? 'separate' : 'collapse',
          borderSpacing: block.cellspacing || undefined,
          border: block.border || undefined,
          color: block.color || '#000',
          fontSize: block.fontSize || '14px',
          fontFamily: block.fontFamily || undefined,
          textAlign: (block.align as React.CSSProperties['textAlign']) || 'left',
        }}
      >
        {block.headers.length > 0 && (
          <thead>
            <tr style={{ backgroundColor: '#f5f5f5' }}>
              {block.headers.map((h, i) => (
                <th
                  key={i}
                  style={{
                    padding: cellPad,
                    borderBottom: '1px solid #ddd',
                    textAlign: 'left',
                    fontWeight: 600,
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
        )}
        <tbody>
          {block.rows.map((row, ri) => (
            <tr key={ri}>
              {row.map((cell, ci) => (
                <td
                  key={ci}
                  style={{
                    padding: cellPad,
                    borderBottom: '1px solid #eee',
                  }}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
});

TableBlock.displayName = 'TableBlock';
