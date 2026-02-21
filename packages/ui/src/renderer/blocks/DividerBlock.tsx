// packages/ui/src/renderer/blocks/DividerBlock.tsx
import React from 'react';
import { observer } from 'mobx-react-lite';
import type { BlockInstance } from '@marlinjai/email-editor-core';

interface DividerBlockProps {
  block: BlockInstance;
}

/**
 * DividerBlock - Renders a horizontal divider in the email preview
 */
export const DividerBlock = observer(({ block }: DividerBlockProps) => {
  const containerStyle: React.CSSProperties = {
    paddingTop: block.paddingTop || '10px',
    paddingRight: block.paddingRight || undefined,
    paddingBottom: block.paddingBottom || '10px',
    paddingLeft: block.paddingLeft || undefined,
    textAlign: 'center',
  };

  const dividerStyle: React.CSSProperties = {
    borderTop: `${block.borderWidth || '1px'} ${block.borderStyle || 'solid'} ${block.borderColor || '#e5e7eb'}`,
    margin: '0 auto',
    width: block.width || '100%',
  };

  return (
    <div className="divider-block" style={containerStyle}>
      <hr style={dividerStyle} />
    </div>
  );
});

DividerBlock.displayName = 'DividerBlock';
