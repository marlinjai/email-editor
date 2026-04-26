// packages/ui/src/renderer/ColumnRenderer.tsx
import React from 'react';
import { observer } from 'mobx-react-lite';
import clsx from 'clsx';
import type { ColumnInstance, SectionInstance } from '@marlinjai/email-editor-core';
import { useStore } from '../store';
import { BlockRenderer } from './BlockRenderer';
import { SubColumnRenderer } from './SubColumnRenderer';

interface ColumnRendererProps {
  column: ColumnInstance;
  section: SectionInstance;
  columnIndex: number;
}

/**
 * ColumnRenderer - Renders a column within a section
 *
 * Key features:
 * - Renders blocks in order
 * - Handles column selection
 * - Shows drop zones during drag
 * - Applies column styling
 */
export const ColumnRenderer = observer(({ column, section, columnIndex }: ColumnRendererProps) => {
  const { editorUI } = useStore();
  const isSelected = editorUI.selectedColumnId === column.id;
  const isHovered = editorUI.hoverColumnId === column.id && !isSelected;

  // Check if this column is a valid drop target
  const isDropTarget = editorUI.isDragging && editorUI.dropIntent?.targetColumnId === column.id;

  // Handle hidden columns
  if (column.hidden) {
    return (
      <td
        className={clsx(
          'column-placeholder p-2 bg-gray-50 border border-dashed border-gray-200',
          'text-gray-400 text-xs text-center align-middle cursor-pointer',
          isSelected && 'ring-2 ring-blue-500'
        )}
        style={{ width: `${column.width}%` }}
        onClick={(e) => {
          e.stopPropagation();
          editorUI.selectColumn(column.id);
        }}
      >
        Column {columnIndex + 1} (hidden)
      </td>
    );
  }

  return (
    <td
      className={clsx(
        'email-column relative align-top',
        // Selection styling
        isSelected && 'ring-2 ring-inset ring-blue-500',
        isHovered && 'ring-1 ring-inset ring-blue-300',
        // Drop target styling
        isDropTarget && 'bg-blue-50'
      )}
      data-column-id={column.id}
      style={{
        width: `${column.width}%`,
        backgroundColor: column.backgroundColor || undefined,
        verticalAlign: column.verticalAlign || 'top',
        paddingTop: column.paddingTop || undefined,
        paddingRight: column.paddingRight || undefined,
        paddingBottom: column.paddingBottom || undefined,
        paddingLeft: column.paddingLeft || undefined,
      }}
      onClick={(e) => {
        // Only select column if clicking empty area
        if (e.target === e.currentTarget) {
          e.stopPropagation();
          editorUI.selectColumn(column.id);
        }
      }}
      onMouseEnter={() => {
        if (!editorUI.isDragging) {
          editorUI.setHoverColumn(column.id);
        }
      }}
      onMouseLeave={() => {
        editorUI.setHoverColumn(undefined);
      }}
    >
      {/* Column handle: discoverable click target since blocks usually fill the column */}
      {!editorUI.isDragging && (
        <button
          type="button"
          className={clsx(
            'column-handle absolute top-0 left-1/2 -translate-x-1/2 z-10',
            'px-2 py-0.5 text-[10px] font-medium rounded-b cursor-pointer transition-opacity',
            isSelected
              ? 'bg-blue-500 text-white opacity-100'
              : isHovered
              ? 'bg-blue-100 text-blue-700 opacity-100'
              : 'bg-blue-100 text-blue-700 opacity-0 hover:opacity-100'
          )}
          onClick={(e) => {
            e.stopPropagation();
            editorUI.selectColumn(column.id);
          }}
        >
          Col {columnIndex + 1} · {column.width}%
        </button>
      )}

      {/* Group-kind column: render sub-columns as a nested table */}
      {column.kind === 'group' && (
        <table
          width="100%"
          cellPadding={0}
          cellSpacing={0}
          role="presentation"
          style={{ borderCollapse: 'collapse' }}
        >
          <tbody>
            <tr>
              {column.subColumns.map((sc, i) => (
                <SubColumnRenderer key={sc.id} subColumn={sc} subColumnIndex={i} />
              ))}
            </tr>
          </tbody>
        </table>
      )}

      {/* Leaf-kind column: blocks list (existing behavior) */}
      {column.kind === 'leaf' && (
      <div className="column-content space-y-2">
        {column.blocks.map((block, index) => (
          <React.Fragment key={block.id}>
            {/* Drop zone before block */}
            {editorUI.isDragging && (
              <DropZone
                columnId={column.id}
                index={index}
                isActive={
                  editorUI.dropIntent?.targetColumnId === column.id &&
                  editorUI.dropIntent?.targetIndex === index &&
                  editorUI.dropIntent?.position === 'before'
                }
              />
            )}

            <BlockRenderer block={block} />
          </React.Fragment>
        ))}

        {/* Drop zone at end of column */}
        {editorUI.isDragging && (
          <DropZone
            columnId={column.id}
            index={column.blocks.length}
            isActive={
              editorUI.dropIntent?.targetColumnId === column.id &&
              editorUI.dropIntent?.targetIndex === column.blocks.length
            }
          />
        )}

        {/* Empty column placeholder */}
        {column.blocks.length === 0 && !editorUI.isDragging && (
          <div className="empty-column-placeholder p-4 text-center text-gray-400 text-sm border-2 border-dashed border-gray-200 rounded">
            Drop blocks here
          </div>
        )}
      </div>
      )}
    </td>
  );
});

ColumnRenderer.displayName = 'ColumnRenderer';

/**
 * DropZone - Visual indicator for block drop targets
 */
interface DropZoneProps {
  columnId: string;
  index: number;
  isActive: boolean;
}

const DropZone = observer(({ columnId, index, isActive }: DropZoneProps) => {
  const { editorUI } = useStore();

  return (
    <div
      className={clsx(
        'drop-zone transition-all duration-150',
        isActive
          ? 'h-2 bg-blue-400 rounded my-1'
          : 'h-1 bg-transparent hover:bg-blue-200 hover:h-2 rounded my-0.5'
      )}
      onDragEnter={() => {
        editorUI.setDropIntent({
          targetColumnId: columnId,
          targetIndex: index,
          position: 'before',
        });
      }}
    />
  );
});

DropZone.displayName = 'DropZone';
