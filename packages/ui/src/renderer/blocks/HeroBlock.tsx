// packages/ui/src/renderer/blocks/HeroBlock.tsx
import React from 'react';
import { observer } from 'mobx-react-lite';
import type { BlockInstance } from '@returnhypnosis/email-editor-core';

interface HeroBlockProps {
  block: BlockInstance;
}

/**
 * HeroBlock - Renders a hero section with background image
 */
export const HeroBlock = observer(({ block }: HeroBlockProps) => {
  const containerStyle: React.CSSProperties = {
    backgroundImage: block.backgroundImage ? `url(${block.backgroundImage})` : undefined,
    backgroundColor: block.backgroundColor || '#f3f4f6',
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    backgroundRepeat: 'no-repeat',
    minHeight: block.backgroundHeight || '300px',
    width: block.backgroundWidth || '100%',
    display: 'flex',
    alignItems: block.verticalAlign === 'top'
      ? 'flex-start'
      : block.verticalAlign === 'bottom'
        ? 'flex-end'
        : 'center',
    justifyContent: 'center',
    padding: '20px',
    boxSizing: 'border-box',
  };

  const contentStyle: React.CSSProperties = {
    color: block.color || '#ffffff',
    textAlign: 'center',
    maxWidth: '80%',
  };

  return (
    <div className="hero-block" style={containerStyle}>
      <div
        style={contentStyle}
        dangerouslySetInnerHTML={{
          __html: block.content || '<h1>Hero Title</h1><p>Add your hero content here</p>'
        }}
      />
    </div>
  );
});

HeroBlock.displayName = 'HeroBlock';
