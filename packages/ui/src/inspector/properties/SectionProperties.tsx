// packages/ui/src/inspector/properties/SectionProperties.tsx
// Section property panel

import React from 'react';
import { observer } from 'mobx-react-lite';
import clsx from 'clsx';
import type { SectionInstance } from '@marlinjai/email-editor-core';
import {
  TextField,
  ColorField,
  CheckboxField,
  SpacingField,
  ButtonGroupField,
  GradientField,
} from '../fields';

interface SectionPropertiesProps {
  section: SectionInstance;
}

type BackgroundMode = 'color' | 'gradient' | 'image';

function getBackgroundMode(section: SectionInstance): BackgroundMode {
  if (section.backgroundGradient) return 'gradient';
  if (section.backgroundImage) return 'image';
  return 'color';
}

/**
 * Section properties panel
 */
export const SectionProperties = observer(function SectionProperties({
  section,
}: SectionPropertiesProps) {
  const mode = getBackgroundMode(section);

  const setMode = (next: BackgroundMode) => {
    if (next === 'gradient') {
      section.updateProperties({
        backgroundGradient: {
          type: 'linear',
          angle: 135,
          stops: [
            { color: '#667eea', position: 0 },
            { color: '#764ba2', position: 100 },
          ],
        },
        backgroundImage: undefined,
      });
    } else if (next === 'color') {
      section.updateProperties({ backgroundGradient: undefined, backgroundImage: undefined });
    } else {
      section.updateProperties({ backgroundGradient: undefined });
    }
  };

  return (
    <div className="p-4 space-y-4">
      <h3 className="font-semibold text-sm">{section.displayName}</h3>

      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Background</label>
        <div className="flex gap-1 mb-2">
          {(['color', 'gradient', 'image'] as const).map((m) => (
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
            value={section.backgroundColor || ''}
            onChange={(color) => section.updateProperties({ backgroundColor: color || undefined })}
            allowEmpty
          />
        )}

        {mode === 'gradient' && (
          <GradientField
            value={section.backgroundGradient}
            onChange={(gradient) => section.updateProperties({ backgroundGradient: gradient })}
          />
        )}

        {mode === 'image' && (
          <TextField
            label="Image URL"
            value={section.backgroundImage || ''}
            onChange={(url) => section.updateProperties({ backgroundImage: url || undefined })}
            placeholder="https://..."
          />
        )}
      </div>

      <CheckboxField
        label="Full Width"
        checked={section.fullWidth}
        onChange={() => section.toggleFullWidth()}
      />

      <CheckboxField
        label="Keep columns on mobile"
        checked={section.noStack}
        onChange={() => section.toggleNoStack()}
      />

      <ButtonGroupField
        label="Columns"
        value={section.columnCount}
        options={[1, 2, 3, 4]}
        onChange={(count) => section.setColumnCount(count as 1 | 2 | 3 | 4)}
      />

      <SpacingField
        label="Padding"
        top={section.paddingTop || undefined}
        right={section.paddingRight || undefined}
        bottom={section.paddingBottom || undefined}
        left={section.paddingLeft || undefined}
        onChange={(side, value) => {
          const prop = `padding${side.charAt(0).toUpperCase()}${side.slice(1)}`;
          section.updateProperties({ [prop]: value });
        }}
      />
    </div>
  );
});
