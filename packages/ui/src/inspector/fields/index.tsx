// packages/ui/src/inspector/fields/index.tsx
// Reusable form fields for property inspector

import React from 'react';
import clsx from 'clsx';

/**
 * Text input field
 */
export function TextField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
      />
    </div>
  );
}

/**
 * Color picker with text input
 */
export function ColorField({
  label,
  value,
  onChange,
  allowEmpty = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  allowEmpty?: boolean;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      <div className="flex gap-2">
        <input
          type="color"
          value={value || '#000000'}
          onChange={(e) => onChange(e.target.value)}
          className="w-8 h-8 rounded border border-gray-300 cursor-pointer"
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={allowEmpty ? 'transparent' : '#000000'}
          className="flex-1 px-2 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        {allowEmpty && value && (
          <button
            onClick={() => onChange('')}
            className="px-2 py-1 text-xs text-gray-500 hover:text-gray-700"
          >
            Clear
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Select dropdown field
 */
export function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
      >
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    </div>
  );
}

/**
 * Text alignment buttons
 */
export function AlignmentField({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const options = ['left', 'center', 'right', 'justify'];

  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">Alignment</label>
      <div className="flex gap-1">
        {options.map((align) => (
          <button
            key={align}
            onClick={() => onChange(align)}
            className={clsx(
              'flex-1 py-1.5 text-xs rounded border capitalize',
              value === align
                ? 'bg-blue-50 border-blue-500 text-blue-700'
                : 'border-gray-300 hover:bg-gray-50'
            )}
          >
            {align}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Checkbox field
 */
export function CheckboxField({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <label className="flex items-center gap-2 cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="rounded border-gray-300"
      />
      <span className="text-sm text-gray-700">{label}</span>
    </label>
  );
}

/**
 * 4-sided spacing input (top, right, bottom, left)
 */
export function SpacingField({
  label,
  top,
  right,
  bottom,
  left,
  onChange,
}: {
  label: string;
  top?: string;
  right?: string;
  bottom?: string;
  left?: string;
  onChange: (side: 'top' | 'right' | 'bottom' | 'left', value: string | undefined) => void;
}) {
  const sides = ['top', 'right', 'bottom', 'left'] as const;
  const values = { top, right, bottom, left };

  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      <div className="grid grid-cols-4 gap-1">
        {sides.map((side) => (
          <div key={side}>
            <input
              type="text"
              value={values[side] || ''}
              onChange={(e) => onChange(side, e.target.value || undefined)}
              placeholder="0"
              className="w-full px-1 py-1 text-xs border border-gray-300 rounded text-center"
            />
            <div className="text-[10px] text-gray-400 text-center mt-0.5">
              {side[0].toUpperCase()}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Range slider with value display
 */
export function RangeField({
  label,
  value,
  min,
  max,
  onChange,
  unit = '',
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  unit?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value))}
        className="w-full"
      />
      <div className="text-xs text-gray-500 text-right">
        {value}{unit}
      </div>
    </div>
  );
}

/**
 * Button group for selecting from options
 */
export function ButtonGroupField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string | number;
  options: (string | number)[];
  onChange: (value: string | number) => void;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      <div className="flex gap-1">
        {options.map((opt) => (
          <button
            key={opt}
            onClick={() => onChange(opt)}
            className={clsx(
              'flex-1 py-1.5 text-sm rounded border',
              value === opt
                ? 'bg-blue-50 border-blue-500 text-blue-700'
                : 'border-gray-300 hover:bg-gray-50'
            )}
          >
            {opt}
          </button>
        ))}
      </div>
    </div>
  );
}
