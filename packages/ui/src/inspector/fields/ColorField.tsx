// packages/ui/src/inspector/fields/ColorField.tsx
// Color picker field

interface ColorFieldProps {
  label: string;
  value?: string;
  onChange: (value: string) => void;
}

/**
 * Color picker field for property inspector
 */
export function ColorField({ label, value = '#000000', onChange }: ColorFieldProps) {
  return (
    <div className="space-y-1">
      <label className="block text-sm font-medium">{label}</label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-12 h-10 rounded border border-brand-border cursor-pointer"
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="#000000"
          className="input flex-1"
        />
      </div>
    </div>
  );
}

