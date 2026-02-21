// packages/ui/src/renderer/blocks/ButtonBlock.tsx
import React from 'react';
import { observer } from 'mobx-react-lite';
import type { BlockInstance } from '@marlinjai/email-editor-core';

interface ButtonBlockProps {
  block: BlockInstance;
}

/**
 * ButtonBlock - Renders a button/CTA block in the email preview
 */
export const ButtonBlock = observer(({ block }: ButtonBlockProps) => {
  const containerStyle: React.CSSProperties = {
    textAlign: (block.align as React.CSSProperties['textAlign']) || 'center',
    paddingTop: block.paddingTop || undefined,
    paddingRight: block.paddingRight || undefined,
    paddingBottom: block.paddingBottom || undefined,
    paddingLeft: block.paddingLeft || undefined,
  };

  const buttonStyle: React.CSSProperties = {
    display: 'inline-block',
    backgroundColor: block.backgroundColor || '#1a73e8',
    color: block.color || '#ffffff',
    padding: block.innerPadding || '12px 24px',
    borderRadius: block.borderRadius || '4px',
    border: block.border || 'none',
    textDecoration: 'none',
    fontFamily: block.fontFamily || 'inherit',
    fontSize: block.fontSize || '16px',
    fontWeight: 600,
    cursor: 'pointer',
    lineHeight: block.lineHeight || '1.4',
  };

  return (
    <div className="button-block" style={containerStyle}>
      <a
        href={block.href || '#'}
        style={buttonStyle}
        onClick={(e) => e.preventDefault()} // Prevent navigation in editor
      >
        {block.label || 'Click Here'}
      </a>
    </div>
  );
});

ButtonBlock.displayName = 'ButtonBlock';
