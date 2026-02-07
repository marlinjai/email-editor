// packages/ui/src/inspector/properties/ColumnProperties.tsx
// Column property panel

import React from 'react';
import { observer } from 'mobx-react-lite';
import type { ColumnInstance } from '@returnhypnosis/email-editor-core';
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
    </div>
  );
});
