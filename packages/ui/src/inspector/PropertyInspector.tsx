// packages/ui/src/inspector/PropertyInspector.tsx
// Property Inspector with instant MST updates

import React from 'react';
import { observer } from 'mobx-react-lite';
import { useStore } from '../store';
import { BlockProperties } from './properties/BlockProperties';
import { SectionProperties } from './properties/SectionProperties';
import { ColumnProperties } from './properties/ColumnProperties';
import { SubColumnProperties } from './properties/SubColumnProperties';

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
  const selectedSubColumn = store.selectedSubColumn;

  // No selection - show empty state
  if (!selectedBlock && !selectedSection && !selectedColumn && !selectedSubColumn) {
    return (
      <div className="w-72 border-l border-brand-border bg-canvas-2 p-6 flex items-center justify-center text-text-dark-muted text-sm">
        Select an element to edit its properties
      </div>
    );
  }

  // Find the parent column for the sub-column inspector.
  let subColumnParent: any = undefined;
  if (selectedSubColumn) {
    for (const section of store.template.sections) {
      const parent = section.columns.find((c: any) =>
        (c.subColumns ?? []).some((s: any) => s.id === selectedSubColumn.id),
      );
      if (parent) { subColumnParent = parent; break; }
    }
  }

  return (
    <div className="w-72 border-l border-brand-border bg-canvas-2 overflow-y-auto">
      {selectedBlock && (
        <BlockProperties
          block={selectedBlock}
          onDelete={() => onDeleteBlock?.(selectedBlock.id)}
        />
      )}

      {selectedSubColumn && !selectedBlock && subColumnParent && (
        <SubColumnProperties subColumn={selectedSubColumn} parentColumn={subColumnParent} />
      )}

      {selectedSection && !selectedBlock && !selectedSubColumn && (
        <SectionProperties section={selectedSection} />
      )}

      {selectedColumn && !selectedBlock && !selectedSection && !selectedSubColumn && (
        <ColumnProperties column={selectedColumn} />
      )}
    </div>
  );
});
