// packages/ui/src/inspector/properties/ColumnProperties.tsx
// Column property panel

import React from 'react';
import { observer } from 'mobx-react-lite';
import clsx from 'clsx';
import type { ColumnInstance } from '@marlinjai/email-editor-core';
import {
  ColorField,
  SelectField,
  SpacingField,
  RangeField,
  GradientField,
} from '../fields';

interface ColumnPropertiesProps {
  column: ColumnInstance;
}

type BackgroundMode = 'color' | 'gradient';

function getBackgroundMode(column: ColumnInstance): BackgroundMode {
  if (column.backgroundGradient) return 'gradient';
  return 'color';
}

/**
 * Column properties panel
 */
export const ColumnProperties = observer(function ColumnProperties({
  column,
}: ColumnPropertiesProps) {
  const mode = getBackgroundMode(column);

  const setMode = (next: BackgroundMode) => {
    if (next === 'gradient') {
      column.updateProperties({
        backgroundGradient: {
          type: 'linear',
          angle: 135,
          stops: [
            { color: '#667eea', position: 0 },
            { color: '#764ba2', position: 100 },
          ],
        },
      });
    } else {
      column.updateProperties({ backgroundGradient: undefined });
    }
  };

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

      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Background</label>
        <div className="flex gap-1 mb-2">
          {(['color', 'gradient'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={clsx(
                'flex-1 py-1 text-xs rounded border capitalize',
                mode === m
                  ? 'bg-blue-50 border-blue-500 text-blue-700'
                  : 'border-gray-300 hover:bg-gray-50'
              )}
            >
              {m}
            </button>
          ))}
        </div>

        {mode === 'color' && (
          <ColorField
            label="Color"
            value={column.backgroundColor || ''}
            onChange={(color) => column.updateProperties({ backgroundColor: color || undefined })}
            allowEmpty
          />
        )}

        {mode === 'gradient' && (
          <GradientField
            value={column.backgroundGradient}
            onChange={(gradient) => column.updateProperties({ backgroundGradient: gradient })}
          />
        )}
      </div>

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
