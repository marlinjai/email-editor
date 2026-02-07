// packages/ui/src/renderer/blocks/SpacerBlock.tsx
import React from 'react';
import { observer } from 'mobx-react-lite';
import type { BlockInstance } from '@returnhypnosis/email-editor-core';

interface SpacerBlockProps {
  block: BlockInstance;
}

/**
 * SpacerBlock - Renders vertical spacing in the email preview
 */
export const SpacerBlock = observer(({ block }: SpacerBlockProps) => {
  const style: React.CSSProperties = {
    height: block.height || '20px',
    width: '100%',
  };

  return (
    <div className="spacer-block" style={style}>
      {/* Spacer is just empty space */}
    </div>
  );
});

SpacerBlock.displayName = 'SpacerBlock';
