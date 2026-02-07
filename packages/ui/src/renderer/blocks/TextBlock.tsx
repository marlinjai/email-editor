// packages/ui/src/renderer/blocks/TextBlock.tsx
import React from 'react';
import { observer } from 'mobx-react-lite';
import type { BlockInstance } from '@returnhypnosis/email-editor-core';

interface TextBlockProps {
  block: BlockInstance;
}

/**
 * TextBlock - Renders a text block in the email preview
 *
 * Uses MST computed style for instant reactivity.
 * When any property changes, only this component re-renders.
 */
export const TextBlock = observer(({ block }: TextBlockProps) => {
  // Cast to React.CSSProperties for compatibility with React's style prop
  const style = block.computedStyle as React.CSSProperties;

  return (
    <div
      className="text-block"
      style={{
        ...style,
        minHeight: '1em',
        wordBreak: 'break-word',
      }}
      dangerouslySetInnerHTML={{ __html: block.content || '<p>Enter text...</p>' }}
    />
  );
});

TextBlock.displayName = 'TextBlock';
