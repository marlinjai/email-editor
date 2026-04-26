// packages/ui/src/sidebar/PrebuiltTemplateCard.tsx
// Editorial-style preview card with a live scaled mini-render of a section.

import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import { ArrowRight } from 'lucide-react';
import { createRootStore, type PrebuiltTemplate } from '@marlinjai/email-editor-core';
import { StoreProvider } from '../store';
import { EmailRenderer } from '../renderer';

interface PrebuiltTemplateCardProps {
  template: PrebuiltTemplate;
  onSelect: (template: PrebuiltTemplate) => void;
}

const PREVIEW_INTRINSIC_WIDTH = 600;

export function PrebuiltTemplateCard({ template, onSelect }: PrebuiltTemplateCardProps) {
  const previewStore = useMemo(
    () =>
      createRootStore({
        template: {
          id: `preview-${template.id}`,
          sections: [template.section as any],
        },
      }),
    [template.id]
  );

  const previewWindowRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);

  const [windowSize, setWindowSize] = useState({ w: 0, h: 0 });
  const [contentHeight, setContentHeight] = useState(0);

  useLayoutEffect(() => {
    const winEl = previewWindowRef.current;
    const stageEl = stageRef.current;
    if (!winEl || !stageEl) return;

    const winObs = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      if (r) setWindowSize({ w: r.width, h: r.height });
    });
    winObs.observe(winEl);

    const contentObs = new ResizeObserver((entries) => {
      const h = entries[0]?.contentRect.height;
      if (h && h > 0) setContentHeight(h);
    });
    contentObs.observe(stageEl);

    return () => {
      winObs.disconnect();
      contentObs.disconnect();
    };
  }, []);

  const scale = windowSize.w > 0 ? windowSize.w / PREVIEW_INTRINSIC_WIDTH : 0.5;
  const scaledContentHeight = contentHeight * scale;
  const overflow = scaledContentHeight > windowSize.h;
  const verticalOffset = overflow ? 0 : Math.max(0, (windowSize.h - scaledContentHeight) / 2);

  const handleSelect = () => onSelect(template);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleSelect();
        }
      }}
      aria-label={`Insert ${template.name}`}
      className={clsx(
        'group relative flex flex-col cursor-pointer overflow-hidden',
        'rounded-xl bg-white ring-1 ring-black/[0.06]',
        'shadow-[0_1px_2px_rgba(0,0,0,0.04)]',
        'transition-all duration-200 ease-out',
        'hover:-translate-y-0.5 hover:shadow-[0_8px_24px_-4px_rgba(0,0,0,0.12)] hover:ring-amber-400/40',
        'focus:outline-none focus:ring-2 focus:ring-amber-500'
      )}
    >
      {/* Live preview window */}
      <div
        ref={previewWindowRef}
        className="relative w-full overflow-hidden bg-[#fafaf7]"
        style={{ aspectRatio: '5 / 3' }}
      >
        {/* Scaled stage. Width is the intrinsic email width (600px); we scale + offset. */}
        <div
          ref={stageRef}
          className="absolute left-0 pointer-events-none"
          style={{
            top: verticalOffset,
            width: PREVIEW_INTRINSIC_WIDTH,
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
          }}
        >
          <StoreProvider value={previewStore}>
            <EmailRenderer />
          </StoreProvider>
        </div>

        {/* Bottom fade — only when content overflows */}
        {overflow && (
          <div
            aria-hidden
            className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-b from-transparent to-white pointer-events-none"
          />
        )}

        {/* Insert badge on hover */}
        <div
          aria-hidden
          className={clsx(
            'absolute bottom-3 right-3 flex items-center gap-1.5',
            'px-3 py-1.5 rounded-full bg-amber-500 text-white',
            'text-xs font-medium tracking-wide shadow-md',
            'opacity-0 translate-y-1 transition-all duration-200',
            'group-hover:opacity-100 group-hover:translate-y-0'
          )}
        >
          Insert
          <ArrowRight size={12} strokeWidth={2.5} />
        </div>
      </div>

      {/* Footer: name + category */}
      <div className="flex items-baseline justify-between gap-3 px-4 py-3 border-t border-black/[0.04]">
        <span className="font-serif text-[15px] leading-snug text-neutral-900 truncate">
          {template.name}
        </span>
        <span className="text-[10px] uppercase tracking-[0.12em] text-neutral-400 shrink-0">
          {template.category}
        </span>
      </div>
    </div>
  );
}
