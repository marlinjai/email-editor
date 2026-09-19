// packages/ui/src/renderer/WrapperRenderer.tsx
import React from 'react';
import { observer } from 'mobx-react-lite';
import { isAlive } from 'mobx-state-tree';
import clsx from 'clsx';
import type { WrapperInstance } from '@marlinjai/email-editor-core';
import { useStore } from '../store';
import { SectionRenderer } from './SectionRenderer';

/**
 * WrapperRenderer - a container around sections (MJML mj-wrapper) on the canvas
 *
 * Draws the wrapper's box as the mail does: background, border, radius and
 * padding (MJML's `20px 0` when none is set), with its gap between the
 * sections inside. Its selection ring and handle sit one level out from the
 * sections' (violet, where sections are amber).
 */
export const WrapperRenderer = observer(({ wrapper }: { wrapper: WrapperInstance }) => {
  const { editorUI } = useStore();
  if (!isAlive(wrapper)) return null;
  const isSelected = editorUI.selectedWrapperId === wrapper.id;
  const isHovered = editorUI.hoverWrapperId === wrapper.id && !isSelected;
  const select = (e: React.SyntheticEvent) => {
    e.stopPropagation();
    editorUI.selectWrapper(wrapper.id);
  };

  if (wrapper.hidden) {
    return (
      <div
        data-wrapper-id={wrapper.id}
        className={clsx(
          'hidden-wrapper-placeholder mx-4 my-2 p-4',
          'bg-gray-100 border border-dashed border-violet-300 rounded',
          'text-gray-400 text-sm flex items-center justify-center gap-2 cursor-pointer',
          isSelected && 'ring-2 ring-violet-500'
        )}
        onClick={select}
      >
        <span>{wrapper.displayName} (hidden)</span>
      </div>
    );
  }

  return (
    <div
      data-wrapper-id={wrapper.id}
      className={clsx(
        'email-wrapper relative',
        isSelected && 'outline outline-2 -outline-offset-2 outline-violet-500',
        isHovered && 'outline outline-1 -outline-offset-1 outline-violet-300'
      )}
      style={wrapper.computedStyle as React.CSSProperties}
      onClick={(e) => {
        // The wrapper's own padding and background: a click there selects the wrapper.
        if (e.target === e.currentTarget) select(e);
      }}
      onMouseEnter={() => {
        if (!editorUI.isDragging) editorUI.setHoverWrapper(wrapper.id);
      }}
      onMouseLeave={() => editorUI.setHoverWrapper(undefined)}
    >
      <button
        type="button"
        aria-label={`Select container: ${wrapper.displayName}`}
        className={clsx(
          'wrapper-handle absolute top-0 left-0 px-2 py-0.5 text-xs font-medium rounded-br z-30 cursor-pointer transition-opacity',
          isSelected
            ? 'bg-violet-600 text-white opacity-100'
            : isHovered
            ? 'bg-violet-100 text-violet-800 opacity-100'
            : 'bg-violet-100 text-violet-800 opacity-0 hover:opacity-100 focus:opacity-100'
        )}
        onClick={select}
      >
        Container
      </button>

      {wrapper.sections.map((section, index) => (
        <div
          key={section.id}
          // MJML puts the gap above every section but the first.
          style={index > 0 && wrapper.gap ? { marginTop: wrapper.gap } : undefined}
        >
          <SectionRenderer section={section} sectionIndex={index} />
        </div>
      ))}

      {wrapper.sections.length === 0 && (
        <div
          className="min-h-[80px] flex items-center justify-center border-2 border-dashed border-violet-200 rounded text-sm text-gray-400 cursor-pointer"
          onClick={select}
        >
          Empty container: move sections into it from the Layers panel
        </div>
      )}
    </div>
  );
});

WrapperRenderer.displayName = 'WrapperRenderer';
