// packages/ui/src/renderer/blocks/CarouselBlock.tsx
import React, { useState } from 'react';
import { observer } from 'mobx-react-lite';
import type { BlockInstance } from '@marlinjai/email-editor-core';

interface CarouselBlockProps {
  block: BlockInstance;
}

export const CarouselBlock = observer(({ block }: CarouselBlockProps) => {
  const [activeIndex, setActiveIndex] = useState(0);

  if (block.images.length === 0) {
    return (
      <div className="carousel-block" style={{ padding: '12px', color: '#6b7280', fontSize: '14px' }}>
        No carousel images
      </div>
    );
  }

  const activeImage = block.images[activeIndex];
  const showThumbnails = block.thumbnails !== 'hidden' && block.images.length > 1;

  return (
    <div className="carousel-block" style={block.computedStyle as React.CSSProperties}>
      {/* Main image */}
      <div style={{ position: 'relative', textAlign: 'center' }}>
        {block.images.length > 1 && (
          <button
            onClick={() => setActiveIndex((activeIndex - 1 + block.images.length) % block.images.length)}
            style={{
              position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)',
              background: 'rgba(0,0,0,0.4)', color: '#fff', border: 'none',
              borderRadius: '50%', width: 32, height: 32, cursor: 'pointer', fontSize: '16px',
              zIndex: 1,
            }}
          >
            &#8249;
          </button>
        )}

        <img
          src={activeImage.src}
          alt={activeImage.alt || ''}
          style={{
            maxWidth: '100%',
            borderRadius: block.borderRadius || undefined,
            display: 'block',
            margin: '0 auto',
          }}
        />

        {block.images.length > 1 && (
          <button
            onClick={() => setActiveIndex((activeIndex + 1) % block.images.length)}
            style={{
              position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
              background: 'rgba(0,0,0,0.4)', color: '#fff', border: 'none',
              borderRadius: '50%', width: 32, height: 32, cursor: 'pointer', fontSize: '16px',
              zIndex: 1,
            }}
          >
            &#8250;
          </button>
        )}
      </div>

      {/* Thumbnails */}
      {showThumbnails && (
        <div style={{ display: 'flex', gap: '4px', justifyContent: 'center', marginTop: '8px' }}>
          {block.images.map((img, i) => (
            <img
              key={i}
              src={img.thumbnailSrc || img.src}
              alt={img.alt || ''}
              onClick={() => setActiveIndex(i)}
              style={{
                width: block.iconWidth || '40px',
                height: block.iconWidth || '40px',
                objectFit: 'cover',
                borderRadius: block.tbBorderRadius || '4px',
                cursor: 'pointer',
                opacity: i === activeIndex ? 1 : 0.5,
                border: i === activeIndex ? '2px solid #333' : '2px solid transparent',
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
});

CarouselBlock.displayName = 'CarouselBlock';
