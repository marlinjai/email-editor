// packages/ui/src/inspector/properties/ColumnProperties.tsx
// Column property panel

import React from 'react';
import { observer } from 'mobx-react-lite';
import type { ColumnInstance } from '@marlinjai/email-editor-core';
import {
  ColorField,
  SelectField,
  SpacingField,
  RangeField,
} from '../fields';

interface ColumnPropertiesProps {
  column: ColumnInstance;
}

/**
 * Column properties panel
 */
export const ColumnProperties = observer(function ColumnProperties({
  column,
}: ColumnPropertiesProps) {
  return (
    <div className="p-4 space-y-4">
      <h3 className="font-semibold text-sm">Column</h3>

      <RangeField
        label="Width"
        value={column.width}
        min={10}
        max={100}
        onChange={(width) => column.setWidth(width)}
        unit="%"
      />

      <ColorField
        label="Background Color"
        value={column.backgroundColor || ''}
        onChange={(color) => column.updateProperties({ backgroundColor: color || undefined })}
        allowEmpty
      />

      <SelectField
        label="Vertical Align"
        value={column.verticalAlign || 'top'}
        options={['top', 'middle', 'bottom']}
        onChange={(align) => column.updateProperties({ verticalAlign: align as any })}
      />

      <SpacingField
        label="Padding"
        top={column.paddingTop || undefined}
        right={column.paddingRight || undefined}
        bottom={column.paddingBottom || undefined}
        left={column.paddingLeft || undefined}
        onChange={(side, value) => {
          const prop = `padding${side.charAt(0).toUpperCase()}${side.slice(1)}`;
          column.updateProperties({ [prop]: value });
        }}
      />

      {column.kind === 'leaf' && (
        <div className="pt-3 border-t border-border-light">
          <label className="block text-xs font-semibold text-text-dark-muted uppercase mb-2">
            Layout
          </label>
          <div className="grid grid-cols-3 gap-2">
            {[2, 3, 4].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => column.splitIntoSubColumns(n as 2 | 3 | 4)}
                className="p-2 rounded border border-border-light hover:border-accent hover:bg-accent/5 text-xs text-text-dark"
              >
                Split {n}
              </button>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-text-dark-muted leading-snug">
            Split this column into 2-4 side-by-side sub-columns.
            Existing blocks move to sub-column 1.
          </p>
        </div>
      )}

      {column.kind === 'group' && (
        <div className="pt-3 border-t border-border-light">
          <label className="block text-xs font-semibold text-text-dark-muted uppercase mb-2">
            Layout
          </label>
          <p className="text-[11px] text-text-dark-muted">
            This column has {column.subColumns.length} sub-columns.
            Select one in the canvas to edit its properties, or click below to merge them back into a single column.
          </p>
          <button
            type="button"
            onClick={() => column.mergeSubColumns()}
            className="mt-2 w-full p-2 text-xs text-text-dark border border-border-light rounded hover:border-accent hover:bg-accent/5"
          >
            Merge sub-columns into one
          </button>
        </div>
      )}
    </div>
  );
});
