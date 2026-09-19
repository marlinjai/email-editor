// packages/ui/src/inspector/properties/SectionProperties.tsx
// Section property panel

import React, { useEffect, useState } from 'react';
import { observer } from 'mobx-react-lite';
import clsx from 'clsx';
import type { SectionInstance, BackgroundGradient } from '@marlinjai/email-editor-core';
import { useStore } from '../../store';
import { BackgroundImageField } from './BackgroundImageField';
import {
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
  const { template, editorUI } = useStore();
  // "image" chosen before an image exists: the data alone cannot tell.
  const [chosenMode, setChosenMode] = useState<BackgroundMode | null>(null);
  useEffect(() => setChosenMode(null), [section.id]);
  const fromData = getBackgroundMode(section);
  const mode: BackgroundMode = fromData !== 'color' ? fromData : chosenMode === 'image' ? 'image' : 'color';
  const wrapper = template.findWrapperBySectionId(section.id);

  const setMode = (next: BackgroundMode) => {
    setChosenMode(next);
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

      {wrapper ? (
        <div className="flex items-center justify-between gap-2 rounded border border-violet-200 bg-violet-50 px-2 py-1.5 text-xs text-violet-900">
          <span>Inside a container</span>
          <span className="flex gap-2">
            <button type="button" className="underline" onClick={() => editorUI.selectWrapper(wrapper.id)}>
              Select container
            </button>
            <button
              type="button"
              className="underline"
              onClick={() => {
                const at = template.getSectionIndex(wrapper.id);
                template.moveSectionTo(section.id, { wrapperId: null, index: at + 1 });
              }}
            >
              Move out
            </button>
          </span>
        </div>
      ) : (
        <button
          type="button"
          className="w-full rounded border border-gray-300 px-2 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
          onClick={() => {
            const w = template.wrapSection(section.id);
            if (w) editorUI.selectWrapper(w.id);
          }}
        >
          Wrap in container
        </button>
      )}

      {section.columnsOverflow ? (
        <p
          role="status"
          data-testid="section-columns-overflow"
          className="rounded border border-amber-300 bg-amber-50 px-2 py-1.5 text-xs text-amber-800"
        >
          These columns add up to {Math.round(section.columnWidthTotal)}%, so the last one wraps below on desktop.
        </p>
      ) : null}

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
            value={section.backgroundGradient as BackgroundGradient | undefined}
            onChange={(gradient) => section.updateProperties({ backgroundGradient: gradient })}
          />
        )}

        {mode === 'image' && (
          <BackgroundImageField
            targetId={section.id}
            targetType="section"
            value={section.backgroundImage}
            onChange={(url, id) => template.getSectionById(id)?.updateProperties({ backgroundImage: url })}
          />
        )}
        {mode === 'image' && wrapper?.backgroundImage ? (
          <p role="status" className="mt-2 rounded border border-amber-300 bg-amber-50 px-2 py-1.5 text-xs text-amber-800">
            The container has a background image too. Outlook on Windows cannot show both: give only one of them an image.
          </p>
        ) : null}
      </div>

      <CheckboxField
        label="Full Width"
        checked={section.fullWidth}
        onChange={() => section.toggleFullWidth()}
        // Inside a container MJML draws the section at the container's width either way, so it can only be switched off.
        disabled={Boolean(wrapper) && !section.fullWidth}
        hint={
          wrapper
            ? wrapper.fullWidth
              ? 'Inside a full-width container, MJML draws sections at standard width: set full width on the container.'
              : "Inside a container, a section is as wide as the container's content: set full width on the container."
            : undefined
        }
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
