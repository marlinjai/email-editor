// packages/ui/src/renderer/blocks/ImageBlock.tsx
import React from 'react';
import { observer } from 'mobx-react-lite';
import type { BlockInstance } from '@returnhypnosis/email-editor-core';

interface ImageBlockProps {
  block: BlockInstance;
}

/**
 * ImageBlock - Renders an image block in the email preview
 */
export const ImageBlock = observer(({ block }: ImageBlockProps) => {
  const containerStyle: React.CSSProperties = {
    textAlign: (block.align as React.CSSProperties['textAlign']) || 'center',
    paddingTop: block.paddingTop || undefined,
    paddingRight: block.paddingRight || undefined,
    paddingBottom: block.paddingBottom || undefined,
    paddingLeft: block.paddingLeft || undefined,
  };

  const imageStyle: React.CSSProperties = {
    maxWidth: '100%',
    width: block.width || 'auto',
    height: block.height || 'auto',
    borderRadius: block.borderRadius || undefined,
    display: 'inline-block',
  };

  // If no source, show placeholder
  if (!block.src) {
    return (
      <div className="image-block" style={containerStyle}>
        <div
          style={{
            width: block.width || '200px',
            height: block.height || '150px',
            backgroundColor: '#e5e7eb',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: block.borderRadius || undefined,
            color: '#6b7280',
            fontSize: '14px',
            margin: block.align === 'center' ? '0 auto' : undefined,
          }}
        >
          No image
        </div>
      </div>
    );
  }

  const imageElement = (
    <img
      src={block.src}
      alt={block.alt || ''}
      style={imageStyle}
    />
  );

  // Wrap in link if href is set
  const content = block.href ? (
    <a href={block.href} style={{ display: 'inline-block' }}>
      {imageElement}
    </a>
  ) : imageElement;

  return (
    <div className="image-block" style={containerStyle}>
      {content}
    </div>
  );
});

ImageBlock.displayName = 'ImageBlock';
