// packages/ui/src/inspector/PropertyInspector.tsx
// Property Inspector with instant MST updates

import React from 'react';
import { observer } from 'mobx-react-lite';
import { useStore } from '../store';
import { BlockProperties } from './properties/BlockProperties';
import { SectionProperties } from './properties/SectionProperties';
import { ColumnProperties } from './properties/ColumnProperties';

interface PropertyInspectorProps {
  onDeleteBlock?: (blockId: string) => void;
}

/**
 * PropertyInspector - Property editor panel
 *
 * Updates MST models directly for instant visual feedback.
 * No intermediate state or MJML recompilation needed.
 */
export const PropertyInspector = observer(function PropertyInspector({
  onDeleteBlock,
}: PropertyInspectorProps) {
  const store = useStore();

  const selectedBlock = store.selectedBlock;
  const selectedSection = store.selectedSection;
  const selectedColumn = store.selectedColumn;

  // No selection - show empty state
  if (!selectedBlock && !selectedSection && !selectedColumn) {
    return (
      <div className="w-72 border-l border-brand-border bg-white p-6 flex items-center justify-center text-gray-400 text-sm">
        Select an element to edit its properties
      </div>
    );
  }

  return (
    <div className="w-72 border-l border-brand-border bg-white overflow-y-auto">
      {selectedBlock && (
        <BlockProperties
          block={selectedBlock}
          onDelete={() => onDeleteBlock?.(selectedBlock.id)}
        />
      )}

      {selectedSection && !selectedBlock && (
        <SectionProperties section={selectedSection} />
      )}

      {selectedColumn && !selectedBlock && !selectedSection && (
        <ColumnProperties column={selectedColumn} />
      )}
    </div>
  );
});
