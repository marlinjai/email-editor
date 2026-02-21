// packages/ui/src/renderer/blocks/RawBlock.tsx
import React from 'react';
import { observer } from 'mobx-react-lite';
import type { BlockInstance } from '@marlinjai/email-editor-core';

interface RawBlockProps {
  block: BlockInstance;
}

/**
 * RawBlock - Renders custom HTML content
 */
export const RawBlock = observer(({ block }: RawBlockProps) => {
  if (!block.html) {
    return (
      <div
        className="raw-block"
        style={{
          padding: '20px',
          border: '1px dashed #d1d5db',
          borderRadius: '4px',
          backgroundColor: '#f9fafb',
          color: '#6b7280',
          fontSize: '14px',
          textAlign: 'center',
        }}
      >
        Custom HTML block (empty)
      </div>
    );
  }

  return (
    <div
      className="raw-block"
      dangerouslySetInnerHTML={{ __html: block.html }}
    />
  );
});

RawBlock.displayName = 'RawBlock';
