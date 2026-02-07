// packages/ui/src/inspector/properties/SectionProperties.tsx
// Section property panel

import React from 'react';
import { observer } from 'mobx-react-lite';
import type { SectionInstance } from '@returnhypnosis/email-editor-core';
import {
  TextField,
  ColorField,
  CheckboxField,
  SpacingField,
  ButtonGroupField,
} from '../fields';

interface SectionPropertiesProps {
  section: SectionInstance;
}

/**
 * Section properties panel
 */
export const SectionProperties = observer(function SectionProperties({
  section,
}: SectionPropertiesProps) {
  return (
    <div className="p-4 space-y-4">
      <h3 className="font-semibold text-sm">{section.displayName}</h3>

      <ColorField
        label="Background Color"
        value={section.backgroundColor || ''}
        onChange={(color) => section.updateProperties({ backgroundColor: color || undefined })}
        allowEmpty
      />

      <TextField
        label="Background Image"
        value={section.backgroundImage || ''}
        onChange={(url) => section.updateProperties({ backgroundImage: url || undefined })}
        placeholder="https://..."
      />

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
