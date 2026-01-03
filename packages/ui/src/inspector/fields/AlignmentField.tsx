// packages/ui/src/inspector/fields/AlignmentField.tsx
// Alignment button group field

import { AlignLeft, AlignCenter, AlignRight, AlignJustify } from 'lucide-react';
import clsx from 'clsx';

type Alignment = 'left' | 'center' | 'right' | 'justify';

interface AlignmentFieldProps {
  label: string;
  value?: Alignment;
  onChange: (value: Alignment) => void;
  includeJustify?: boolean;
}

/**
 * Alignment button group for property inspector
 */
export function AlignmentField({
  label,
  value = 'left',
  onChange,
  includeJustify = false,
}: AlignmentFieldProps) {
  const alignments: Array<{ value: Alignment; icon: typeof AlignLeft }> = [
    { value: 'left', icon: AlignLeft },
    { value: 'center', icon: AlignCenter },
    { value: 'right', icon: AlignRight },
  ];

  if (includeJustify) {
    alignments.push({ value: 'justify', icon: AlignJustify });
  }

  return (
    <div className="space-y-1">
      <label className="block text-sm font-medium">{label}</label>
      <div className="flex gap-1">
        {alignments.map(({ value: alignValue, icon: Icon }) => (
          <button
            key={alignValue}
            onClick={() => onChange(alignValue)}
            className={clsx(
              'flex-1 p-2 rounded border transition-colors',
              value === alignValue
                ? 'bg-brand-primary text-white border-brand-primary'
                : 'border-brand-border hover:bg-gray-50'
            )}
          >
            <Icon size={16} className="mx-auto" />
          </button>
        ))}
      </div>
    </div>
  );
}

