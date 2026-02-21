// packages/ui/src/renderer/SectionRenderer.tsx
import React from 'react';
import { observer } from 'mobx-react-lite';
import clsx from 'clsx';
import type { SectionInstance } from '@marlinjai/email-editor-core';
import { useStore } from '../store';
import { ColumnRenderer } from './ColumnRenderer';

interface SectionRendererProps {
  section: SectionInstance;
  sectionIndex: number;
}

/**
 * SectionRenderer - Renders a section with its columns
 *
 * Key features:
 * - Table-based layout for email compatibility
 * - Section selection and hover states
 * - Column distribution
 * - Background styling
 */
export const SectionRenderer = observer(({ section, sectionIndex }: SectionRendererProps) => {
  const { editorUI } = useStore();
  const isSelected = editorUI.selectedSectionId === section.id;
  const isHovered = editorUI.hoverSectionId === section.id && !isSelected;

  // Handle hidden sections
  if (section.hidden) {
    return (
      <div
        className={clsx(
          'hidden-section-placeholder mx-4 my-2 p-4',
          'bg-gray-100 border border-dashed border-gray-300 rounded',
          'text-gray-400 text-sm flex items-center justify-center gap-2 cursor-pointer',
          isSelected && 'ring-2 ring-amber-500'
        )}
        onClick={(e) => {
          e.stopPropagation();
          editorUI.selectSection(section.id);
        }}
      >
        <span className="opacity-50">👁️‍🗨️</span>
        <span>{section.displayName} (hidden)</span>
      </div>
    );
  }

  const sectionStyle: React.CSSProperties = {
    backgroundColor: section.backgroundColor || undefined,
    backgroundImage: section.backgroundImage ? `url(${section.backgroundImage})` : undefined,
    backgroundPosition: section.backgroundPosition || 'center',
    backgroundRepeat: section.backgroundRepeat || 'no-repeat',
    backgroundSize: section.backgroundSize || 'cover',
    paddingTop: section.paddingTop || '20px',
    paddingRight: section.paddingRight || '20px',
    paddingBottom: section.paddingBottom || '20px',
    paddingLeft: section.paddingLeft || '20px',
    width: section.fullWidth ? '100%' : undefined,
  };

  return (
    <div
      className={clsx(
        'email-section relative',
        // Selection ring
        isSelected && 'ring-2 ring-amber-500 ring-offset-2',
        // Hover ring
        isHovered && 'ring-1 ring-amber-300'
      )}
      data-section-id={section.id}
      style={sectionStyle}
      onClick={(e) => {
        // Only select section if clicking the section background, not a child
        if (e.target === e.currentTarget || (e.target as HTMLElement).classList.contains('email-section')) {
          e.stopPropagation();
          editorUI.selectSection(section.id);
        }
      }}
      onMouseEnter={() => {
        if (!editorUI.isDragging) {
          editorUI.setHoverSection(section.id);
        }
      }}
      onMouseLeave={() => {
        editorUI.setHoverSection(undefined);
      }}
    >
      {/* Section label (shown on selection/hover) */}
      {(isSelected || isHovered) && (
        <div
          className={clsx(
            'absolute -top-6 left-0 px-2 py-1 text-xs font-medium rounded-t z-10',
            isSelected ? 'bg-amber-500 text-white' : 'bg-amber-100 text-amber-700'
          )}
        >
          {section.displayName}
        </div>
      )}

      {/* Section toolbar (shown on selection) */}
      {isSelected && (
        <SectionToolbar section={section} />
      )}

      {/* Table-based layout for email compatibility */}
      <table
        width="100%"
        cellPadding="0"
        cellSpacing="0"
        role="presentation"
        style={{ borderCollapse: 'collapse' }}
      >
        <tbody>
          <tr>
            {section.columns.map((column, index) => (
              <ColumnRenderer
                key={column.id}
                column={column}
                section={section}
                columnIndex={index}
              />
            ))}
          </tr>
        </tbody>
      </table>

      {/* Empty section indicator */}
      {section.isEmpty && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className="text-gray-300 text-sm">Empty section</span>
        </div>
      )}
    </div>
  );
});

SectionRenderer.displayName = 'SectionRenderer';

/**
 * Section toolbar with duplicate/delete actions
 */
const SectionToolbar = observer(({ section }: { section: SectionInstance }) => {
  const { template, editorUI } = useStore();

  const handleDuplicate = (e: React.MouseEvent) => {
    e.stopPropagation();
    const newSection = template.duplicateSection(section.id);
    if (newSection) {
      editorUI.selectSection(newSection.id);
    }
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    template.removeSection(section.id);
    editorUI.clearSelection();
  };

  return (
    <div className="absolute -top-6 right-0 flex gap-1">
      <button
        className="p-1 bg-amber-500 text-white text-xs rounded hover:bg-amber-600"
        onClick={handleDuplicate}
        title="Duplicate section"
      >
        ⎘
      </button>
      <button
        className="p-1 bg-red-500 text-white text-xs rounded hover:bg-red-600"
        onClick={handleDelete}
        title="Delete section"
      >
        ✕
      </button>
    </div>
  );
});

SectionToolbar.displayName = 'SectionToolbar';
