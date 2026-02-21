// packages/ui/src/renderer/blocks/AccordionBlock.tsx
import React, { useState } from 'react';
import { observer } from 'mobx-react-lite';
import type { BlockInstance } from '@marlinjai/email-editor-core';

interface AccordionBlockProps {
  block: BlockInstance;
}

export const AccordionBlock = observer(({ block }: AccordionBlockProps) => {
  const [openIndex, setOpenIndex] = useState<number | null>(0);
  const iconRight = block.iconPosition !== 'left';

  if (block.items.length === 0) {
    return (
      <div className="accordion-block" style={{ padding: '12px', color: '#6b7280', fontSize: '14px' }}>
        No accordion items
      </div>
    );
  }

  return (
    <div
      className="accordion-block"
      style={{
        fontFamily: block.fontFamily || undefined,
        ...(block.computedStyle as React.CSSProperties),
      }}
    >
      {block.items.map((item, i) => {
        const isOpen = openIndex === i;
        return (
          <div
            key={i}
            style={{
              borderBottom: `1px solid ${block.borderColor || '#e0e0e0'}`,
            }}
          >
            <button
              onClick={() => setOpenIndex(isOpen ? null : i)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexDirection: iconRight ? 'row' as const : 'row-reverse' as const,
                width: '100%',
                padding: '12px 8px',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: '14px',
                textAlign: 'left',
                color: 'inherit',
                fontFamily: 'inherit',
              }}
            >
              <span style={{ flex: 1 }}>{item.title}</span>
              <span style={{ fontSize: '12px', marginLeft: iconRight ? '8px' : 0, marginRight: iconRight ? 0 : '8px' }}>
                {isOpen ? '\u25B2' : '\u25BC'}
              </span>
            </button>
            {isOpen && (
              <div style={{ padding: '8px 8px 12px', fontSize: '14px', color: '#4b5563' }}>
                {item.content}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
});

AccordionBlock.displayName = 'AccordionBlock';
