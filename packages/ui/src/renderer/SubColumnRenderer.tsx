// packages/ui/src/renderer/SubColumnRenderer.tsx
import React from 'react';
import { observer } from 'mobx-react-lite';
import clsx from 'clsx';
import { useDroppable } from '@dnd-kit/core';
import type { SubColumnInstance } from '@marlinjai/email-editor-core';
import { useStore } from '../store';
import { BlockRenderer } from './BlockRenderer';

interface SubColumnRendererProps {
  subColumn: SubColumnInstance;
  subColumnIndex: number;
}

export const SubColumnRenderer = observer(({ subColumn, subColumnIndex }: SubColumnRendererProps) => {
  const { editorUI } = useStore();
  const isSelected = editorUI.selectedSubColumnId === subColumn.id;
  const isHovered = editorUI.hoverSubColumnId === subColumn.id && !isSelected;

  return (
    <td
      className={clsx(
        'email-sub-column relative align-top',
        isSelected && 'ring-2 ring-inset ring-blue-500',
        isHovered && 'ring-1 ring-inset ring-blue-300',
      )}
      data-sub-column-id={subColumn.id}
      style={{
        width: `${subColumn.width}%`,
        backgroundColor: subColumn.backgroundColor || undefined,
        verticalAlign: subColumn.verticalAlign || 'top',
        paddingTop: subColumn.paddingTop || undefined,
        paddingRight: subColumn.paddingRight || undefined,
        paddingBottom: subColumn.paddingBottom || undefined,
        paddingLeft: subColumn.paddingLeft || undefined,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          e.stopPropagation();
          editorUI.selectSubColumn(subColumn.id);
        }
      }}
      onMouseEnter={() => {
        if (!editorUI.isDragging) editorUI.setHoverSubColumn(subColumn.id);
      }}
      onMouseLeave={() => editorUI.setHoverSubColumn(undefined)}
    >
      {!editorUI.isDragging && (
        <button
          type="button"
          className={clsx(
            'sub-column-handle absolute top-0 left-1/2 -translate-x-1/2 z-[5]',
            'px-2 py-0.5 text-[10px] font-medium rounded-b cursor-pointer transition-opacity',
            isSelected
              ? 'bg-blue-500 text-white opacity-100'
              : isHovered
              ? 'bg-blue-50 text-blue-700 opacity-100'
              : 'bg-blue-50 text-blue-700 opacity-0 hover:opacity-100',
          )}
          onClick={(e) => {
            e.stopPropagation();
            editorUI.selectSubColumn(subColumn.id);
          }}
        >
          Sub {subColumnIndex + 1} · {subColumn.width}%
        </button>
      )}

      <div className="sub-column-content space-y-2">
        {subColumn.blocks.map((block, index) => (
          <React.Fragment key={block.id}>
            {editorUI.isDragging && (
              <DropZone subColumnId={subColumn.id} index={index} />
            )}
            <BlockRenderer block={block} />
          </React.Fragment>
        ))}
        {editorUI.isDragging && (
          <DropZone subColumnId={subColumn.id} index={subColumn.blocks.length} />
        )}
        {subColumn.blocks.length === 0 && !editorUI.isDragging && (
          <div className="empty-subcolumn-placeholder p-3 text-center text-gray-400 text-xs border-2 border-dashed border-gray-200 rounded">
            Drop blocks here
          </div>
        )}
      </div>
    </td>
  );
});

SubColumnRenderer.displayName = 'SubColumnRenderer';

interface DropZoneProps {
  subColumnId: string;
  index: number;
}
const DropZone = observer(({ subColumnId, index }: DropZoneProps) => {
  const { editorUI } = useStore();
  const dropId = `drop-subcolumn-${subColumnId}-${index}`;
  const { setNodeRef, isOver } = useDroppable({
    id: dropId,
    data: { subColumnId, index },
  });
  return (
    <div
      ref={setNodeRef}
      className={clsx(
        'drop-zone transition-all duration-150',
        isOver
          ? 'h-2 bg-blue-400 rounded my-1'
          : 'h-1 bg-transparent hover:bg-blue-200 hover:h-2 rounded my-0.5',
      )}
      onDragEnter={() => {
        editorUI.setDropIntent({
          targetSubColumnId: subColumnId,
          targetIndex: index,
          position: 'before',
        });
      }}
    />
  );
});
DropZone.displayName = 'SubColumnDropZone';
