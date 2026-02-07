// packages/ui/src/inspector/fields/index.tsx
// Reusable form fields for property inspector

import React from 'react';
import clsx from 'clsx';
import { Bold, Italic, Link, Strikethrough, Underline } from 'lucide-react';

/**
 * Normalize spacing values to ensure valid CSS units.
 *
 * CSS ignores unitless values (except 0), so we auto-append "px" for bare numbers.
 * MJML supports: px, % (em/rem have poor email client support)
 *
 * @example
 * normalizeSpacingValue("10")    // "10px" - bare number gets px
 * normalizeSpacingValue("10px")  // "10px" - already has unit
 * normalizeSpacingValue("5%")    // "5%"   - percent is valid
 * normalizeSpacingValue("0")     // "0"    - zero works without unit
 * normalizeSpacingValue("")      // undefined - empty clears value
 */
export function normalizeSpacingValue(value: string): string | undefined {
  if (!value || value.trim() === '') return undefined;

  const trimmed = value.trim();

  // Zero is valid without unit
  if (trimmed === '0') return '0';

  // Already has valid unit - keep as-is
  if (/^-?\d+(\.\d+)?(px|%|em|rem)$/i.test(trimmed)) {
    return trimmed;
  }

  // Bare number - append px
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    return `${trimmed}px`;
  }

  // Invalid - return as-is (let CSS handle it)
  return trimmed;
}

/**
 * Formatting toolbar for text editing
 * Uses execCommand for contenteditable WYSIWYG editing
 *
 * Important: Uses onMouseDown with preventDefault to keep focus
 * in the contenteditable text block while clicking buttons.
 */
export function FormattingToolbar() {
  const applyFormat = (command: string, value?: string) => {
    document.execCommand(command, false, value);
  };

  // Prevent button from stealing focus from contenteditable
  const preventFocusLoss = (e: React.MouseEvent) => {
    e.preventDefault();
  };

  const handleLink = () => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;

    // Check if already a link
    const parentLink = selection.anchorNode?.parentElement?.closest('a');
    if (parentLink) {
      // Remove link
      document.execCommand('unlink', false);
    } else {
      // Add link - note: prompt() will steal focus, but that's unavoidable
      const url = prompt('Enter URL:', 'https://');
      if (url) {
        document.execCommand('createLink', false, url);
      }
    }
  };

  return (
    <div className="flex gap-1 p-1 bg-gray-50 rounded border border-gray-200">
      <button
        type="button"
        onMouseDown={preventFocusLoss}
        onClick={() => applyFormat('bold')}
        className="p-1.5 rounded hover:bg-gray-200 text-gray-700"
        title="Bold (Ctrl+B)"
      >
        <Bold size={14} />
      </button>
      <button
        type="button"
        onMouseDown={preventFocusLoss}
        onClick={() => applyFormat('italic')}
        className="p-1.5 rounded hover:bg-gray-200 text-gray-700"
        title="Italic (Ctrl+I)"
      >
        <Italic size={14} />
      </button>
      <button
        type="button"
        onMouseDown={preventFocusLoss}
        onClick={() => applyFormat('underline')}
        className="p-1.5 rounded hover:bg-gray-200 text-gray-700"
        title="Underline (Ctrl+U)"
      >
        <Underline size={14} />
      </button>
      <button
        type="button"
        onMouseDown={preventFocusLoss}
        onClick={() => applyFormat('strikeThrough')}
        className="p-1.5 rounded hover:bg-gray-200 text-gray-700"
        title="Strikethrough"
      >
        <Strikethrough size={14} />
      </button>
      <div className="w-px bg-gray-300 mx-1" />
      <button
        type="button"
        onMouseDown={preventFocusLoss}
        onClick={handleLink}
        className="p-1.5 rounded hover:bg-gray-200 text-gray-700"
        title="Insert Link"
      >
        <Link size={14} />
      </button>
    </div>
  );
}

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
 * Theme color swatch type
 */
interface ThemeColorSwatch {
  name: string;
  value: string;
}

/**
 * Color picker with text input and theme color swatches
 */
export function ColorField({
  label,
  value,
  onChange,
  allowEmpty = false,
  themeColors = [],
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  allowEmpty?: boolean;
  themeColors?: ThemeColorSwatch[];
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      {/* Theme color swatches */}
      {themeColors.length > 0 && (
        <div className="flex gap-1 mb-2">
          {themeColors.map((color) => (
            <button
              key={color.name}
              type="button"
              onClick={() => onChange(color.value)}
              className={clsx(
                'w-6 h-6 rounded border-2 cursor-pointer transition-transform hover:scale-110',
                value === color.value ? 'border-blue-500 ring-1 ring-blue-300' : 'border-gray-300'
              )}
              style={{ backgroundColor: color.value }}
              title={`${color.name}: ${color.value}`}
            />
          ))}
        </div>
      )}
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
 *
 * Automatically normalizes values to ensure valid CSS units.
 * Bare numbers like "10" become "10px".
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
              onChange={(e) => {
                const normalized = normalizeSpacingValue(e.target.value);
                onChange(side, normalized);
              }}
              placeholder="0px"
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
