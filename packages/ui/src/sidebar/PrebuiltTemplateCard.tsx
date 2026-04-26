// packages/ui/src/sidebar/PrebuiltTemplateCard.tsx
// Single card in the pre-built templates modal: live mini-render of a section.

import React, { useMemo } from 'react';
import clsx from 'clsx';
import { createRootStore, type PrebuiltTemplate } from '@marlinjai/email-editor-core';
import { StoreProvider } from '../store';
import { EmailRenderer } from '../renderer';

interface PrebuiltTemplateCardProps {
  template: PrebuiltTemplate;
  onSelect: (template: PrebuiltTemplate) => void;
}

const PREVIEW_SCALE = 0.35;
const PREVIEW_WIDTH = 600;
const CARD_HEIGHT = 200;

export function PrebuiltTemplateCard({ template, onSelect }: PrebuiltTemplateCardProps) {
  // Ephemeral isolated store containing only this template's section.
  // Memoized by template.id so re-renders don't rebuild the MST tree.
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

  // Card is a div+role=button (not <button>) because the live preview inside
  // contains <button>/<a> elements that would be invalid as descendants.
  // pointer-events: none on the preview prevents them from capturing clicks.
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
        'group flex flex-col rounded-lg border border-border-light bg-canvas-2 cursor-pointer',
        'hover:border-accent hover:shadow-md focus:outline-none focus:ring-2 focus:ring-accent transition-all text-left overflow-hidden'
      )}
    >
      {/* Live preview window */}
      <div
        className="relative bg-white overflow-hidden border-b border-border-light"
        style={{
          height: CARD_HEIGHT,
          width: '100%',
        }}
      >
        <div
          className="absolute top-0 left-1/2 pointer-events-none"
          style={{
            width: PREVIEW_WIDTH,
            transform: `translateX(-50%) scale(${PREVIEW_SCALE})`,
            transformOrigin: 'top center',
          }}
        >
          <StoreProvider value={previewStore}>
            <EmailRenderer />
          </StoreProvider>
        </div>
      </div>

      {/* Footer: name + category */}
      <div className="px-3 py-2 flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-text-dark truncate">
          {template.name}
        </span>
        <span className="text-[10px] uppercase tracking-wide text-text-dark-muted shrink-0">
          {template.category}
        </span>
      </div>
    </div>
  );
}
