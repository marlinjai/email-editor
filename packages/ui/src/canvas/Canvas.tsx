// packages/ui/src/canvas/Canvas.tsx
// Main canvas component with preview and device toggle

import { useState } from 'react';
import { Monitor, Smartphone } from 'lucide-react';
import { PreviewFrame } from './PreviewFrame';
import clsx from 'clsx';

interface CanvasProps {
  html: string;
  selectedBlockId?: string | null;
  onBlockClick?: (blockId: string) => void;
}

type DeviceType = 'desktop' | 'mobile';

/**
 * Canvas component for email preview
 * Supports desktop and mobile device views
 */
export function Canvas({ html, selectedBlockId, onBlockClick }: CanvasProps) {
  const [device, setDevice] = useState<DeviceType>('desktop');

  return (
    <div className="flex-1 flex flex-col bg-gray-100">
      {/* Device toolbar */}
      <div className="bg-white border-b border-brand-border px-4 py-2 flex items-center gap-2">
        <button
          onClick={() => setDevice('desktop')}
          className={clsx(
            'p-2 rounded transition-colors',
            device === 'desktop'
              ? 'bg-brand-primary text-white'
              : 'hover:bg-gray-100'
          )}
          title="Desktop view"
        >
          <Monitor size={18} />
        </button>
        <button
          onClick={() => setDevice('mobile')}
          className={clsx(
            'p-2 rounded transition-colors',
            device === 'mobile'
              ? 'bg-brand-primary text-white'
              : 'hover:bg-gray-100'
          )}
          title="Mobile view"
        >
          <Smartphone size={18} />
        </button>
      </div>

      {/* Preview frame */}
      <div className="flex-1 overflow-auto p-8 flex justify-center">
        <div
          className={clsx(
            'bg-white shadow-lg transition-all',
            device === 'desktop' ? 'w-full max-w-[600px]' : 'w-[375px]'
          )}
          style={{ height: 'fit-content', minHeight: '400px' }}
        >
          <PreviewFrame
            html={html}
            selectedBlockId={selectedBlockId}
            onBlockClick={onBlockClick}
          />
        </div>
      </div>
    </div>
  );
}

