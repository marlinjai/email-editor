// packages/ui/src/inspector/fields/SelectField.tsx
// Select dropdown field

interface SelectFieldProps {
  label: string;
  value?: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}

/**
 * Select dropdown field for property inspector
 */
export function SelectField({ label, value, onChange, options }: SelectFieldProps) {
  return (
    <div className="space-y-1">
      <label className="block text-sm font-medium">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="input"
      >
        <option value="">Select...</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

