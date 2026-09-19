// packages/ui/src/inspector/properties/WrapperProperties.tsx
// Wrapper (container around sections, MJML mj-wrapper) property panel

import React, { useEffect, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { isAlive } from 'mobx-state-tree';
import clsx from 'clsx';
import { Copy, Trash2, Ungroup } from 'lucide-react';
import type { BackgroundGradient, WrapperInstance, WrapperProperties as WrapperProps } from '@marlinjai/email-editor-core';
import { useStore } from '../../store';
import { TextField, ColorField, CheckboxField, SpacingField, ButtonGroupField, GradientField, SelectField } from '../fields';
import { BackgroundImageField } from './BackgroundImageField';

type BackgroundMode = 'color' | 'gradient' | 'image';

const POSITIONS = ['top center', 'top left', 'top right', 'center center', 'center left', 'center right', 'bottom center', 'bottom left', 'bottom right'];
const SIZES = ['auto', 'cover', 'contain'];
const SIDES = ['Top', 'Right', 'Bottom', 'Left'] as const;

/** A gap as MJML takes it (px); a bare number gets px; empty clears. */
export function parseGap(input: string): { value: string | undefined } | { error: string } {
  const v = input.trim();
  if (v === '') return { value: undefined };
  if (/^[0-9]+(\.[0-9]+)?$/.test(v)) return { value: `${v}px` };
  if (/^[0-9]+(\.[0-9]+)?px$/.test(v)) return { value: v };
  return { error: 'The gap is a length in px, e.g. 16px.' };
}

function backgroundMode(wrapper: WrapperInstance): BackgroundMode {
  if (wrapper.backgroundGradient) return 'gradient';
  if (wrapper.backgroundImage) return 'image';
  return 'color';
}

/**
 * The wrapper's panel: every mj-wrapper attribute, with the controls the
 * section panel uses (colour, background image through the host's picker,
 * padding, border, radius), and the actions one level out from a section
 * (unwrap, duplicate, delete).
 */
export const WrapperProperties = observer(function WrapperProperties({ wrapper }: { wrapper: WrapperInstance }) {
  // Unwrapped or deleted: the inspector is about to show something else.
  if (!isAlive(wrapper)) return null;
  return <WrapperPanel wrapper={wrapper} />;
});

const WrapperPanel = observer(function WrapperPanel({ wrapper }: { wrapper: WrapperInstance }) {
  const { template, editorUI } = useStore();
  // "image" chosen before an image exists: the data alone cannot tell.
  const [chosenMode, setChosenMode] = useState<BackgroundMode | null>(null);
  useEffect(() => setChosenMode(null), [wrapper.id]);
  const fromData = backgroundMode(wrapper);
  const mode: BackgroundMode = fromData !== 'color' ? fromData : chosenMode === 'image' ? 'image' : 'color';
  const update = (updates: WrapperProps) => wrapper.updateProperties(updates);

  // The gap field keeps what is typed until it is a valid px length.
  const [gapDraft, setGapDraft] = useState(wrapper.gap ?? '');
  const [gapError, setGapError] = useState<string | undefined>();
  useEffect(() => {
    setGapDraft(wrapper.gap ?? '');
    setGapError(undefined);
  }, [wrapper.id, wrapper.gap]);

  const [perSide, setPerSide] = useState(() => SIDES.some((s) => wrapper[`border${s}`]));

  const setMode = (next: BackgroundMode) => {
    setChosenMode(next);
    if (next === 'gradient') {
      update({
        backgroundGradient: { type: 'linear', angle: 135, stops: [{ color: '#667eea', position: 0 }, { color: '#764ba2', position: 100 }] },
        backgroundImage: undefined,
      });
    } else if (next === 'color') {
      update({ backgroundGradient: undefined, backgroundImage: undefined });
    } else {
      update({ backgroundGradient: undefined });
    }
  };

  const kept = Object.keys(wrapper.extraAttributes ?? {});
  const unwrap = () => {
    const ids = template.unwrap(wrapper.id);
    if (ids[0]) editorUI.selectSection(ids[0]);
    else editorUI.clearSelection();
  };
  const duplicate = () => {
    const copy = template.duplicateWrapper(wrapper.id);
    if (copy) editorUI.selectWrapper(copy.id);
  };

  return (
    <div className="p-4 space-y-4" data-testid="wrapper-properties">
      <div>
        <h3 className="font-semibold text-sm">Container</h3>
        <p className="mt-1 text-xs text-gray-500">
          Groups {wrapper.sections.length === 1 ? 'one section' : `${wrapper.sections.length} sections`} under one background, border and padding (an
          MJML <code>mj-wrapper</code>).
        </p>
      </div>

      <div className="flex gap-1">
        <ActionButton icon={<Ungroup size={14} />} label="Unwrap" onClick={unwrap} />
        <ActionButton icon={<Copy size={14} />} label="Duplicate" onClick={duplicate} />
        <ActionButton icon={<Trash2 size={14} />} label="Delete" tone="danger" onClick={() => editorUI.requestWrapperDelete(wrapper.id)} />
      </div>

      <div role="group" aria-label="Background">
        <span className="block text-xs font-medium text-gray-600 mb-1">Background</span>
        <div className="flex gap-1 mb-2">
          {(['color', 'gradient', 'image'] as const).map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={mode === m}
              onClick={() => setMode(m)}
              className={clsx(
                'flex-1 py-1 text-xs rounded border capitalize',
                mode === m ? 'bg-blue-50 border-blue-500 text-blue-700' : 'border-gray-300 hover:bg-gray-50'
              )}
            >
              {m}
            </button>
          ))}
        </div>

        {mode !== 'gradient' && (
          <ColorField
            label="Background colour"
            value={wrapper.backgroundColor || ''}
            onChange={(color) => update({ backgroundColor: color || undefined })}
            allowEmpty
          />
        )}

        {mode === 'gradient' && (
          <GradientField
            value={wrapper.backgroundGradient as BackgroundGradient | undefined}
            onChange={(gradient) => update({ backgroundGradient: gradient })}
          />
        )}

        {mode === 'image' && (
          <div className="mt-3 space-y-3">
            <BackgroundImageField
              targetId={wrapper.id}
              targetType="wrapper"
              value={wrapper.backgroundImage}
              onChange={(url, id) => template.getWrapperById(id)?.updateProperties({ backgroundImage: url })}
            />
            <SelectField
              label="Image position"
              value={wrapper.backgroundPosition || 'top center'}
              options={POSITIONS}
              onChange={(v) => update({ backgroundPosition: v === 'top center' ? undefined : v })}
            />
            <SelectField
              label="Image size"
              value={wrapper.backgroundSize || 'auto'}
              options={SIZES}
              onChange={(v) => update({ backgroundSize: v === 'auto' ? undefined : v })}
            />
            <ButtonGroupField
              label="Image repeat"
              value={wrapper.backgroundRepeat || 'repeat'}
              options={['repeat', 'no-repeat']}
              onChange={(v) => update({ backgroundRepeat: v === 'repeat' ? undefined : (v as 'no-repeat') })}
            />
            <p className="text-xs text-gray-500">Outlook on Windows cannot show a section's own background image inside a container that has one.</p>
          </div>
        )}
      </div>

      <SpacingField
        label="Padding"
        top={wrapper.paddingTop || undefined}
        right={wrapper.paddingRight || undefined}
        bottom={wrapper.paddingBottom || undefined}
        left={wrapper.paddingLeft || undefined}
        placeholders={
          wrapper.paddingTop || wrapper.paddingRight || wrapper.paddingBottom || wrapper.paddingLeft
            ? undefined
            : { top: '20px', right: '0px', bottom: '20px', left: '0px' }
        }
        hint={
          wrapper.paddingTop || wrapper.paddingRight || wrapper.paddingBottom || wrapper.paddingLeft
            ? 'A side left empty is 0.'
            : 'Unset, a container has 20px above and below, as in MJML.'
        }
        onChange={(side, value) => {
          const prop = `padding${side.charAt(0).toUpperCase()}${side.slice(1)}` as 'paddingTop';
          update({ [prop]: value });
        }}
      />

      <TextField
        label="Gap between sections"
        value={gapDraft}
        placeholder="0px"
        hint="Vertical space between the sections inside, in px."
        error={gapError}
        onChange={(v) => {
          setGapDraft(v);
          const parsed = parseGap(v);
          if ('error' in parsed) {
            setGapError(parsed.error);
            return;
          }
          setGapError(undefined);
          update({ gap: parsed.value });
        }}
      />

      <div className="space-y-2">
        <TextField
          label="Border"
          value={wrapper.border || ''}
          placeholder="1px solid #dddddd"
          hint="All four sides, as CSS: width, style, colour."
          onChange={(v) => update({ border: v.trim() || undefined })}
        />
        <button
          type="button"
          aria-expanded={perSide}
          onClick={() => setPerSide(!perSide)}
          className="text-xs text-blue-700 hover:underline"
        >
          {perSide ? 'Hide the sides' : 'Set each side'}
        </button>
        {perSide && (
          <div className="grid grid-cols-2 gap-2">
            {SIDES.map((side) => (
              <TextField
                key={side}
                label={`Border ${side.toLowerCase()}`}
                value={wrapper[`border${side}`] || ''}
                placeholder="none"
                onChange={(v) => update({ [`border${side}`]: v.trim() || undefined } as WrapperProps)}
              />
            ))}
          </div>
        )}
      </div>

      <TextField
        label="Corner radius"
        value={wrapper.borderRadius || ''}
        placeholder="0px"
        onChange={(v) => update({ borderRadius: v.trim() || undefined })}
      />

      <CheckboxField
        label="Full width"
        checked={wrapper.fullWidth}
        onChange={() => wrapper.toggleFullWidth()}
        hint="The background spans the whole width of the mail; the sections inside keep the standard width."
      />

      <div role="group" aria-label="Text alignment">
        <ButtonGroupField
          label="Text alignment"
          value={wrapper.textAlign || ''}
          options={['left', 'center', 'right']}
          onChange={(v) => update({ textAlign: v === wrapper.textAlign ? undefined : (v as 'left' | 'center' | 'right') })}
        />
        <p className="mt-1 text-xs text-gray-500">Unset, MJML centres. Click the active one again to unset it.</p>
      </div>

      <TextField
        label="CSS class"
        value={wrapper.cssClass || ''}
        placeholder="card promo"
        hint="Class names for the document's own styles, separated by spaces."
        onChange={(v) => update({ cssClass: v.trim() ? v : undefined })}
      />

      {kept.length > 0 && (
        <p className="text-xs text-gray-500" data-testid="wrapper-kept-attributes">
          Kept from the import, applied to the mail: {kept.join(', ')}.
        </p>
      )}
    </div>
  );
});

function ActionButton({ icon, label, onClick, tone }: { icon: React.ReactNode; label: string; onClick: () => void; tone?: 'danger' }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        'flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 text-xs rounded border',
        tone === 'danger' ? 'border-red-200 text-red-700 hover:bg-red-50' : 'border-gray-300 text-gray-700 hover:bg-gray-50'
      )}
    >
      {icon}
      {label}
    </button>
  );
}
