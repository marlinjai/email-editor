// packages/ui/src/renderer/blocks/FooterBlock.tsx
import React from 'react';
import { observer } from 'mobx-react-lite';
import type { BlockInstance } from '@marlinjai/email-editor-core';

interface FooterBlockProps {
  block: BlockInstance;
}

export const FooterBlock = observer(({ block: _block }: FooterBlockProps) => {
  return (
    <div
      className="footer-block"
      style={{
        backgroundColor: '#f5f5f5',
        padding: '20px',
        textAlign: 'center',
      }}
    >
      <div style={{ fontSize: '12px', color: '#666666', marginBottom: '8px' }}>
        &copy; {new Date().getFullYear()} All rights reserved.
      </div>
      <div style={{ fontSize: '12px' }}>
        <span style={{ color: '#944923', textDecoration: 'underline', cursor: 'pointer' }}>
          Unsubscribe
        </span>
      </div>
    </div>
  );
});

FooterBlock.displayName = 'FooterBlock';
