// packages/ui/src/renderer/blocks/HeaderBlock.tsx
import React from 'react';
import { observer } from 'mobx-react-lite';
import type { BlockInstance } from '@marlinjai/email-editor-core';

interface HeaderBlockProps {
  block: BlockInstance;
}

export const HeaderBlock = observer(({ block: _block }: HeaderBlockProps) => {
  return (
    <div
      className="header-block"
      style={{
        backgroundColor: '#ffffff',
        padding: '20px',
        textAlign: 'center',
      }}
    >
      <div
        style={{
          width: '70px',
          height: '70px',
          backgroundColor: '#e5e7eb',
          borderRadius: '50%',
          margin: '0 auto 12px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#9ca3af',
          fontSize: '12px',
        }}
      >
        Logo
      </div>
      <div
        style={{
          fontSize: '24px',
          color: '#944923',
          fontFamily: 'Georgia, serif',
        }}
      >
        Welcome to the Newsletter
      </div>
    </div>
  );
});

HeaderBlock.displayName = 'HeaderBlock';
