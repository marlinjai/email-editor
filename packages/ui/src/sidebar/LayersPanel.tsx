// packages/ui/src/sidebar/LayersPanel.tsx
// Document structure tree view with drag-and-drop reordering

import React from 'react';
import { observer } from 'mobx-react-lite';
import { useStore } from '../store';
import { ChevronRight, Eye, EyeOff, Trash2, GripVertical, Copy } from 'lucide-react';
import clsx from 'clsx';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

export const LayersPanel = observer(function LayersPanel() {
  const { template, editorUI } = useStore();

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = template.sections.findIndex((s) => s.id === active.id);
    const newIndex = template.sections.findIndex((s) => s.id === over.id);

    if (oldIndex !== -1 && newIndex !== -1) {
      template.moveSection(active.id as string, newIndex);
    }
  };

  if (template.sections.length === 0) {
    return (
      <div className="p-4 text-gray-400 text-sm text-center">
        No sections yet. Add a section from the Layout tab.
      </div>
    );
  }

  const sectionIds = template.sections.map((s) => s.id);

  return (
    <div className="p-2">
      <h3 className="px-2 py-1 text-xs font-semibold text-gray-500 uppercase tracking-wider">
        Document Structure
      </h3>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={sectionIds} strategy={verticalListSortingStrategy}>
          <div className="mt-2 space-y-1">
            {template.sections.map((section, sIndex) => (
              <SortableSectionItem
                key={section.id}
                section={section}
                index={sIndex}
                isSelected={editorUI.selectedSectionId === section.id}
                onSelect={() => editorUI.selectSection(section.id)}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
});

/**
 * Sortable wrapper for SectionItem
 */
const SortableSectionItem = observer(function SortableSectionItem({
  section,
  index,
  isSelected,
  onSelect,
}: {
  section: any;
  index: number;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: section.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <SectionItem
        section={section}
        index={index}
        isSelected={isSelected}
        onSelect={onSelect}
        dragHandleProps={{ ...attributes, ...listeners }}
      />
    </div>
  );
});

const SectionItem = observer(function SectionItem({
  section,
  index,
  isSelected,
  onSelect,
  dragHandleProps,
}: {
  section: any;
  index: number;
  isSelected: boolean;
  onSelect: () => void;
  dragHandleProps?: Record<string, any>;
}) {
  const { template, editorUI } = useStore();
  const [expanded, setExpanded] = React.useState(true);

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
    if (isSelected) editorUI.clearSelection();
  };

  return (
    <div className="rounded overflow-hidden">
      {/* Section header */}
      <div
        className={clsx(
          'flex items-center gap-1 px-2 py-1.5 cursor-pointer',
          isSelected
            ? 'bg-amber-100 text-amber-800'
            : 'hover:bg-gray-100'
        )}
        onClick={onSelect}
      >
        {/* Drag handle */}
        <button
          className="p-0.5 cursor-grab hover:bg-gray-200 rounded text-gray-400 hover:text-gray-600"
          title="Drag to reorder"
          {...dragHandleProps}
        >
          <GripVertical size={14} />
        </button>

        <button
          onClick={(e) => {
            e.stopPropagation();
            setExpanded(!expanded);
          }}
          className="p-0.5 hover:bg-gray-200 rounded"
        >
          <ChevronRight
            size={14}
            className={clsx('transition-transform', expanded && 'rotate-90')}
          />
        </button>

        <span className={clsx('flex-1 text-sm', section.hidden && 'opacity-50')}>
          {section.displayName}
        </span>

        <button
          onClick={(e) => {
            e.stopPropagation();
            section.toggleHidden();
          }}
          className="p-1 hover:bg-gray-200 rounded opacity-50 hover:opacity-100"
          title={section.hidden ? 'Show' : 'Hide'}
        >
          {section.hidden ? <EyeOff size={12} /> : <Eye size={12} />}
        </button>

        <button
          onClick={handleDuplicate}
          className="p-1 hover:bg-blue-100 text-blue-500 rounded opacity-50 hover:opacity-100"
          title="Duplicate section"
        >
          <Copy size={12} />
        </button>

        <button
          onClick={handleDelete}
          className="p-1 hover:bg-red-100 text-red-500 rounded opacity-50 hover:opacity-100"
          title="Delete section"
        >
          <Trash2 size={12} />
        </button>
      </div>

      {/* Columns and blocks */}
      {expanded && (
        <div className="ml-4 border-l border-gray-200">
          {section.columns.map((column: any, cIndex: number) => (
            <ColumnItem
              key={column.id}
              column={column}
              section={section}
              index={cIndex}
            />
          ))}
        </div>
      )}
    </div>
  );
});

const ColumnItem = observer(function ColumnItem({
  column,
  section,
  index,
}: {
  column: any;
  section: any;
  index: number;
}) {
  const { editorUI } = useStore();

  return (
    <div className="ml-2">
      <div className="px-2 py-1 text-xs text-gray-500">
        Column {index + 1} ({column.width}%)
      </div>

      {column.blocks.map((block: any) => (
        <BlockItem
          key={block.id}
          block={block}
          isSelected={editorUI.selectedBlockId === block.id}
          onSelect={() => editorUI.selectBlock(block.id)}
        />
      ))}

      {column.blocks.length === 0 && (
        <div className="px-4 py-1 text-xs text-gray-400 italic">
          Empty
        </div>
      )}
    </div>
  );
});

const BlockItem = observer(function BlockItem({
  block,
  isSelected,
  onSelect,
}: {
  block: any;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const { template, editorUI } = useStore();

  return (
    <div
      className={clsx(
        'flex items-center gap-1 px-3 py-1 cursor-pointer text-sm',
        isSelected ? 'bg-blue-100 text-blue-800' : 'hover:bg-gray-50',
        block.hidden && 'opacity-50'
      )}
      onClick={onSelect}
    >
      <span className="flex-1 truncate">{block.displayName}</span>

      <button
        onClick={(e) => {
          e.stopPropagation();
          block.toggleHidden();
        }}
        className="p-0.5 hover:bg-gray-200 rounded opacity-50 hover:opacity-100"
        title={block.hidden ? 'Show' : 'Hide'}
      >
        {block.hidden ? <EyeOff size={10} /> : <Eye size={10} />}
      </button>

      <button
        onClick={(e) => {
          e.stopPropagation();
          template.deleteBlock(block.id);
          if (isSelected) editorUI.clearSelection();
        }}
        className="p-0.5 hover:bg-red-100 text-red-500 rounded opacity-50 hover:opacity-100"
        title="Delete"
      >
        <Trash2 size={10} />
      </button>
    </div>
  );
});
