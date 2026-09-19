// packages/ui/src/sidebar/LayersPanel.tsx
// Document structure tree view with drag-and-drop reordering

import React, { useState } from 'react';
import { observer } from 'mobx-react-lite';
import { isAlive } from 'mobx-state-tree';
import { useStore } from '../store';
import { ChevronRight, Eye, EyeOff, Trash2, GripVertical, Copy, Group, Ungroup, LogOut } from 'lucide-react';
import clsx from 'clsx';
import {
  DndContext,
  useDndContext,
  closestCenter,
  pointerWithin,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  type CollisionDetection,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { isWrapperInstance, type WrapperInstance } from '@marlinjai/email-editor-core';
import { flattenLayers, planLayerDrop, type LayerItem, type LayerRow } from './layersTree';

/**
 * Rows here differ a lot in height (a section row lists its columns and
 * blocks), so the centre-to-centre rule would keep a tall dragged row "over"
 * its own place. With a pointer, the row under the pointer wins; from the
 * keyboard, the row whose top edge is nearest the dragged row's top edge.
 */
export const layersCollision: CollisionDetection = (args) => {
  if (args.pointerCoordinates) {
    const within = pointerWithin(args);
    return within.length > 0 ? within : closestCenter(args);
  }
  const top = args.collisionRect.top;
  return args.droppableContainers
    .flatMap((container) => {
      const rect = args.droppableRects.get(container.id);
      return rect ? [{ id: container.id, data: { droppableContainer: container, value: Math.abs(rect.top - top) } }] : [];
    })
    .sort((a, b) => a.data.value - b.data.value);
};

export const LayersPanel = observer(function LayersPanel() {
  const { template, editorUI } = useStore();
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set());

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

  const items: LayerItem[] = template.sections.map((item) =>
    isWrapperInstance(item)
      ? { id: item.id, type: 'wrapper' as const, sections: item.sections.map((s) => s.id) }
      : { id: item.id, type: 'section' as const }
  );
  // Recomputed on every render: the observer re-renders on any structural change.
  const rows = flattenLayers(items, collapsed);
  const rowIds = rows.map((r) => r.id);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;
    const move = planLayerDrop(items, rows, String(active.id), String(over.id));
    if (!move) return;
    if (move.kind === 'move-top') template.moveSection(move.itemId, move.index);
    else template.moveSectionTo(move.sectionId, { wrapperId: move.wrapperId, index: move.index });
  };

  const toggleCollapsed = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  if (template.sections.length === 0) {
    return (
      <div className="p-4 text-text-dark-muted text-sm text-center">
        No sections yet. Add a section from the Layout tab.
      </div>
    );
  }

  return (
    <div className="p-2">
      <h3 className="px-2 py-1 text-xs font-semibold text-text-dark-muted uppercase tracking-wider">
        Document Structure
      </h3>
      <p className="px-2 pb-1 text-[11px] text-text-dark-muted">
        Drag a section onto a container to move it in, or below the container to move it out.
      </p>

      <DndContext
        sensors={sensors}
        collisionDetection={layersCollision}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={rowIds} strategy={verticalListSortingStrategy}>
          <div className="mt-2 space-y-1" role="tree" aria-label="Document structure">
            {rows.map((row) => (
              <SortableRow
                key={row.id}
                row={row}
                onToggleCollapsed={() => toggleCollapsed(row.id)}
                isSelected={
                  row.kind === 'wrapper'
                    ? editorUI.selectedWrapperId === row.id
                    : row.kind === 'section' && editorUI.selectedSectionId === row.id
                }
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
});

/**
 * One sortable row: a wrapper, a section (indented inside its wrapper), or
 * the thin row that closes a wrapper (a drop target, never dragged).
 */
const SortableRow = observer(function SortableRow({
  row,
  isSelected,
  onToggleCollapsed,
}: {
  row: LayerRow;
  isSelected: boolean;
  onToggleCollapsed: () => void;
}) {
  const { template, editorUI } = useStore();
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
    isOver,
  } = useSortable({ id: row.id, disabled: row.kind === 'end' ? { draggable: true, droppable: false } : false });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  if (row.kind === 'end') return <EndRow wrapperId={row.parent} setNodeRef={setNodeRef} style={style} isOver={isOver} />;

  if (row.kind === 'wrapper') {
    const wrapper = template.getWrapperById(row.id);
    if (!wrapper) return null;
    return (
      <div ref={setNodeRef} style={style}>
        <WrapperItem
          wrapper={wrapper}
          collapsed={row.collapsed}
          isSelected={isSelected}
          onToggleCollapsed={onToggleCollapsed}
          dragHandleProps={{ ...attributes, ...listeners }}
        />
      </div>
    );
  }

  const section = template.getSectionById(row.id);
  if (!section) return null;
  return (
    <div ref={setNodeRef} style={style} className={clsx(row.parent && 'ml-4 border-l-2 border-violet-300 pl-1')}>
      <SectionItem
        section={section}
        parentWrapperId={row.parent}
        isSelected={isSelected}
        onSelect={() => editorUI.selectSection(section.id)}
        dragHandleProps={{ ...attributes, ...listeners }}
      />
    </div>
  );
});

/**
 * Closes a container's sections: a drop just above it lands inside, at the
 * end; a drop below it lands after the container. Tall enough to be a target
 * for the pointer and for keyboard dragging (a thin row would lose to the
 * dragged row's own place), and labelled while something is being dragged.
 */
const EndRow = observer(function EndRow({
  wrapperId,
  setNodeRef,
  style,
  isOver,
}: {
  wrapperId: string;
  setNodeRef: (el: HTMLElement | null) => void;
  style: React.CSSProperties;
  isOver: boolean;
}) {
  const { template } = useStore();
  const { active } = useDndContext();
  const wrapper = template.getWrapperById(wrapperId);
  const empty = !wrapper || wrapper.sections.length === 0;
  return (
    <div
      ref={setNodeRef}
      style={style}
      className="ml-4 border-l-2 border-violet-300"
      data-testid={`layers-end-${wrapperId}`}
      data-over={isOver ? 'true' : undefined}
    >
      <div className={clsx('min-h-[20px] px-3 py-0.5 text-[11px] italic rounded', isOver ? 'bg-violet-100 text-violet-800' : 'text-text-dark-muted')}>
        {empty ? 'Empty: drag a section here' : active ? 'End of container' : null}
      </div>
    </div>
  );
});

const WrapperItem = observer(function WrapperItem({
  wrapper,
  collapsed,
  isSelected,
  onToggleCollapsed,
  dragHandleProps,
}: {
  wrapper: WrapperInstance;
  collapsed: boolean;
  isSelected: boolean;
  onToggleCollapsed: () => void;
  dragHandleProps?: Record<string, any>;
}) {
  const { template, editorUI } = useStore();
  if (!isAlive(wrapper)) return null;
  return (
    <div
      data-testid={`layers-wrapper-${wrapper.id}`}
      role="treeitem"
      aria-selected={isSelected}
      aria-expanded={!collapsed}
      className={clsx(
        'flex items-center gap-1 px-2 py-1.5 cursor-pointer rounded',
        isSelected ? 'bg-violet-100 text-violet-900' : 'hover:bg-canvas-3'
      )}
      onClick={() => editorUI.selectWrapper(wrapper.id)}
    >
      <button
        className="p-0.5 cursor-grab hover:bg-canvas-3 rounded text-text-dark-muted hover:text-text-dark"
        title="Drag to reorder"
        aria-label={`Drag ${wrapper.displayName}`}
        {...dragHandleProps}
      >
        <GripVertical size={14} />
      </button>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onToggleCollapsed();
        }}
        className="p-0.5 hover:bg-canvas-3 rounded"
        aria-label={collapsed ? 'Expand container' : 'Collapse container'}
      >
        <ChevronRight size={14} className={clsx('transition-transform', !collapsed && 'rotate-90')} />
      </button>
      <span className={clsx('flex-1 min-w-0 truncate text-sm font-medium', wrapper.hidden && 'opacity-50')} title={wrapper.displayName}>
        {wrapper.displayName}
      </span>
      <RowButton
        label={wrapper.hidden ? 'Show container' : 'Hide container'}
        onClick={() => wrapper.toggleHidden()}
        icon={wrapper.hidden ? <EyeOff size={12} /> : <Eye size={12} />}
      />
      <RowButton
        label="Duplicate container"
        onClick={() => {
          const copy = template.duplicateWrapper(wrapper.id);
          if (copy) editorUI.selectWrapper(copy.id);
        }}
        icon={<Copy size={12} />}
      />
      <RowButton
        label="Unwrap container"
        onClick={() => {
          const ids = template.unwrap(wrapper.id);
          if (isSelected) {
            if (ids[0]) editorUI.selectSection(ids[0]);
            else editorUI.clearSelection();
          }
        }}
        icon={<Ungroup size={12} />}
      />
      <RowButton
        label="Delete container"
        tone="danger"
        onClick={() => editorUI.requestWrapperDelete(wrapper.id)}
        icon={<Trash2 size={12} />}
      />
    </div>
  );
});

function RowButton({ label, onClick, icon, tone }: { label: string; onClick: () => void; icon: React.ReactNode; tone?: 'danger' }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={clsx(
        'p-1 rounded opacity-50 hover:opacity-100',
        tone === 'danger' ? 'hover:bg-danger/10 text-danger' : 'hover:bg-canvas-3'
      )}
      title={label}
      aria-label={label}
    >
      {icon}
    </button>
  );
}

const SectionItem = observer(function SectionItem({
  section,
  parentWrapperId,
  isSelected,
  onSelect,
  dragHandleProps,
}: {
  section: any;
  parentWrapperId: string | null;
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
    <div className="rounded overflow-hidden" data-testid={`layers-section-${section.id}`}>
      {/* Section header */}
      <div
        role="treeitem"
        aria-selected={isSelected}
        className={clsx(
          'flex items-center gap-1 px-2 py-1.5 cursor-pointer',
          isSelected
            ? 'bg-accent-muted text-accent'
            : 'hover:bg-canvas-3'
        )}
        onClick={onSelect}
      >
        {/* Drag handle */}
        <button
          className="p-0.5 cursor-grab hover:bg-canvas-3 rounded text-text-dark-muted hover:text-text-dark"
          title="Drag to reorder"
          aria-label={`Drag ${section.displayName}`}
          {...dragHandleProps}
        >
          <GripVertical size={14} />
        </button>

        <button
          onClick={(e) => {
            e.stopPropagation();
            setExpanded(!expanded);
          }}
          className="p-0.5 hover:bg-canvas-3 rounded"
        >
          <ChevronRight
            size={14}
            className={clsx('transition-transform', expanded && 'rotate-90')}
          />
        </button>

        <span className={clsx('flex-1 min-w-0 truncate text-sm', section.hidden && 'opacity-50')} title={section.displayName}>
          {section.displayName}
        </span>

        <button
          onClick={(e) => {
            e.stopPropagation();
            section.toggleHidden();
          }}
          className="p-1 hover:bg-canvas-3 rounded opacity-50 hover:opacity-100"
          title={section.hidden ? 'Show' : 'Hide'}
        >
          {section.hidden ? <EyeOff size={12} /> : <Eye size={12} />}
        </button>

        {parentWrapperId ? (
          <RowButton
            label="Move out of container"
            onClick={() =>
              template.moveSectionTo(section.id, { wrapperId: null, index: template.getSectionIndex(parentWrapperId) + 1 })
            }
            icon={<LogOut size={12} />}
          />
        ) : (
          <RowButton
            label="Wrap in container"
            onClick={() => {
              const w = template.wrapSection(section.id);
              if (w && isSelected) editorUI.selectWrapper(w.id);
            }}
            icon={<Group size={12} />}
          />
        )}

        <button
          onClick={handleDuplicate}
          className="p-1 hover:bg-accent-muted text-accent rounded opacity-50 hover:opacity-100"
          title="Duplicate section"
          aria-label="Duplicate section"
        >
          <Copy size={12} />
        </button>

        <button
          onClick={handleDelete}
          className="p-1 hover:bg-danger/10 text-danger rounded opacity-50 hover:opacity-100"
          title="Delete section"
          aria-label="Delete section"
        >
          <Trash2 size={12} />
        </button>
      </div>

      {/* Columns and blocks */}
      {expanded && (
        <div className="ml-4 border-l border-border-light">
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
  const isGroup = column.kind === 'group';

  return (
    <div className="ml-2">
      <div
        className={clsx(
          'px-2 py-1 text-xs cursor-pointer rounded',
          editorUI.selectedColumnId === column.id
            ? 'bg-blue-50 text-blue-800'
            : 'text-text-dark-muted hover:bg-canvas-1',
        )}
        onClick={() => editorUI.selectColumn(column.id)}
      >
        Column {index + 1} ({column.width}%)
        {isGroup && <span className="ml-1 text-blue-600">· {column.subColumns.length} sub</span>}
      </div>

      {!isGroup && column.blocks.map((block: any) => (
        <BlockItem
          key={block.id}
          block={block}
          isSelected={editorUI.selectedBlockId === block.id}
          onSelect={() => editorUI.selectBlock(block.id)}
        />
      ))}

      {!isGroup && column.blocks.length === 0 && (
        <div className="px-4 py-1 text-xs text-text-dark-muted italic">
          Empty
        </div>
      )}

      {isGroup && (
        <div className="ml-3">
          {column.subColumns.map((sc: any, scIdx: number) => (
            <SubColumnItem
              key={sc.id}
              subColumn={sc}
              parentColumn={column}
              index={scIdx}
            />
          ))}
        </div>
      )}
    </div>
  );
});

const SubColumnItem = observer(function SubColumnItem({
  subColumn,
  parentColumn,
  index,
}: {
  subColumn: any;
  parentColumn: any;
  index: number;
}) {
  const { editorUI } = useStore();
  const selected = editorUI.selectedSubColumnId === subColumn.id;

  return (
    <div>
      <div
        className={clsx(
          'flex items-center gap-1 py-1 px-2 rounded cursor-pointer text-xs',
          selected ? 'bg-blue-50 text-blue-800' : 'text-text-dark-muted hover:bg-canvas-1',
        )}
        onClick={() => editorUI.selectSubColumn(subColumn.id)}
      >
        <span className="text-blue-500">⤷</span>
        <span className="flex-1 truncate">
          Sub-column {index + 1} ({Math.round(subColumn.width)}%)
        </span>
        <button
          className="opacity-50 hover:opacity-100 text-red-500 px-1"
          title="Delete sub-column"
          onClick={(e) => {
            e.stopPropagation();
            if (parentColumn.subColumns.length === 2) {
              // Removing one would leave a single sub-column; auto-merge.
              parentColumn.mergeSubColumns();
              editorUI.selectColumn(parentColumn.id);
            } else {
              const idx = parentColumn.subColumns.findIndex((s: any) => s.id === subColumn.id);
              if (idx >= 0) parentColumn.subColumns.splice(idx, 1);
              editorUI.selectColumn(parentColumn.id);
            }
          }}
        >
          ✕
        </button>
      </div>

      {subColumn.blocks.map((block: any) => (
        <div className="ml-4" key={block.id}>
          <BlockItem
            block={block}
            isSelected={editorUI.selectedBlockId === block.id}
            onSelect={() => editorUI.selectBlock(block.id)}
          />
        </div>
      ))}

      {subColumn.blocks.length === 0 && (
        <div className="ml-4 px-4 py-1 text-[11px] text-text-dark-muted italic">
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
        isSelected ? 'bg-accent-muted text-accent' : 'hover:bg-canvas-1',
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
        className="p-0.5 hover:bg-canvas-3 rounded opacity-50 hover:opacity-100"
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
        className="p-0.5 hover:bg-danger/10 text-danger rounded opacity-50 hover:opacity-100"
        title="Delete"
      >
        <Trash2 size={10} />
      </button>
    </div>
  );
});
