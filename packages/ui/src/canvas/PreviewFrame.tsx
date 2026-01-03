// packages/ui/src/canvas/PreviewFrame.tsx
// Iframe preview component

import { useEffect, useRef } from 'react';

interface PreviewFrameProps {
  html: string;
  onBlockClick?: (blockId: string) => void;
  selectedBlockId?: string | null;
}

/**
 * Iframe component for rendering email HTML preview
 * Isolated from main page styles
 */
export function PreviewFrame({ html, onBlockClick, selectedBlockId }: PreviewFrameProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    const doc = iframe.contentDocument;
    if (!doc) return;

    // Write HTML to iframe
    doc.open();
    doc.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <style>
            body {
              margin: 0;
              padding: 20px;
              background: #f5f5f5;
            }
            [data-block-id] {
              cursor: pointer;
              transition: outline 0.2s;
            }
            [data-block-id]:hover {
              outline: 2px dashed #944923;
              outline-offset: 2px;
            }
            [data-block-id].selected {
              outline: 2px solid #944923;
              outline-offset: 2px;
            }
          </style>
        </head>
        <body>
          ${html}
        </body>
      </html>
    `);
    doc.close();

    // Add click handlers to blocks
    const blocks = doc.querySelectorAll('[data-block-id]');
    blocks.forEach((block) => {
      const blockId = block.getAttribute('data-block-id');
      if (blockId) {
        block.addEventListener('click', () => {
          onBlockClick?.(blockId);
        });
        
        // Add selected class if this is the selected block
        if (blockId === selectedBlockId) {
          block.classList.add('selected');
        }
      }
    });
  }, [html, onBlockClick, selectedBlockId]);

  return (
    <iframe
      ref={iframeRef}
      className="w-full h-full border-0"
      title="Email Preview"
    />
  );
}

