// packages/ui/src/sidebar/LayersPanel.tsx
// Document structure tree view

import React from 'react';
import { observer } from 'mobx-react-lite';
import { useStore } from '../store';
import { ChevronRight, Eye, EyeOff, Trash2 } from 'lucide-react';
import clsx from 'clsx';

export const LayersPanel = observer(function LayersPanel() {
  const { template, editorUI } = useStore();

  if (template.sections.length === 0) {
    return (
      <div className="p-4 text-gray-400 text-sm text-center">
        No sections yet. Add a section from the Layout tab.
      </div>
    );
  }

  return (
    <div className="p-2">
      <h3 className="px-2 py-1 text-xs font-semibold text-gray-500 uppercase tracking-wider">
        Document Structure
      </h3>

      <div className="mt-2 space-y-1">
        {template.sections.map((section, sIndex) => (
          <SectionItem
            key={section.id}
            section={section}
            index={sIndex}
            isSelected={editorUI.selectedSectionId === section.id}
            onSelect={() => editorUI.selectSection(section.id)}
          />
        ))}
      </div>
    </div>
  );
});

const SectionItem = observer(function SectionItem({
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
  const { template, editorUI } = useStore();
  const [expanded, setExpanded] = React.useState(true);

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
          onClick={(e) => {
            e.stopPropagation();
            template.removeSection(section.id);
            if (isSelected) editorUI.clearSelection();
          }}
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
