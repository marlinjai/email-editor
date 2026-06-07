// packages/ui/src/inspector/properties/SubColumnProperties.tsx
// Sub-column property panel (depth-2 nested column)

import React from 'react';
import { observer } from 'mobx-react-lite';
import type { SubColumnInstance, ColumnInstance } from '@marlinjai/email-editor-core';
import { useStore } from '../../store';
import {
  ColorField,
  SelectField,
  SpacingField,
  RangeField,
} from '../fields';

interface SubColumnPropertiesProps {
  subColumn: SubColumnInstance;
  parentColumn: ColumnInstance;
}

export const SubColumnProperties = observer(function SubColumnProperties({
  subColumn,
  parentColumn,
}: SubColumnPropertiesProps) {
  const { editorUI } = useStore();

  const handleWidthChange = (w: number) => {
    // Auto-rebalance: distribute the remainder across siblings proportionally so widths still sum to 100.
    const idx = parentColumn.subColumns.findIndex(s => s.id === subColumn.id);
    const others = parentColumn.subColumns.filter((_, i) => i !== idx);
    const remaining = Math.max(0, 100 - w);
    const oldOthersSum = others.reduce((a, s) => a + s.width, 0) || 1;
    others.forEach(s => s.setWidth((s.width / oldOthersSum) * remaining));
    subColumn.setWidth(w);
  };

  return (
    <div className="p-4 space-y-4">
      <div>
        <h3 className="font-semibold text-sm">Sub-column</h3>
        <p className="text-[11px] text-text-dark-muted mt-0.5">
          Inside Column · {parentColumn.subColumns.length} sub-columns total
        </p>
      </div>

      <RangeField
        label="Width"
        value={Math.round(subColumn.width)}
        min={5}
        max={95}
        onChange={handleWidthChange}
        unit="%"
      />

      <ColorField
        label="Background Color"
        value={subColumn.backgroundColor || ''}
        onChange={(color) => subColumn.updateProperties({ backgroundColor: color || undefined })}
        allowEmpty
      />

      <SelectField
        label="Vertical Align"
        value={subColumn.verticalAlign || 'top'}
        options={['top', 'middle', 'bottom']}
        onChange={(align) => subColumn.updateProperties({ verticalAlign: align as any })}
      />

      <SpacingField
        label="Padding"
        top={subColumn.paddingTop || undefined}
        right={subColumn.paddingRight || undefined}
        bottom={subColumn.paddingBottom || undefined}
        left={subColumn.paddingLeft || undefined}
        onChange={(side, value) => {
          const prop = `padding${side.charAt(0).toUpperCase()}${side.slice(1)}`;
          subColumn.updateProperties({ [prop]: value });
        }}
      />

      <button
        type="button"
        onClick={() => {
          parentColumn.mergeSubColumns();
          editorUI.selectColumn(parentColumn.id);
        }}
        className="w-full p-2 text-xs text-text-dark border border-border-light rounded hover:border-accent hover:bg-accent/5"
      >
        Merge sub-columns into one
      </button>
    </div>
  );
});
