import React, { useState, useCallback } from 'react';
import type { SegmentRule, SegmentOperator, ContactStorageAdapter } from '../types';

export interface SegmentBuilderProps {
  adapter: ContactStorageAdapter;
  initialRules?: SegmentRule[];
  onSave?: (name: string, rules: SegmentRule[], description?: string) => void;
  onCancel?: () => void;
  /** Available field options for the field selector */
  fields?: Array<{ value: string; label: string }>;
}

const DEFAULT_FIELDS: Array<{ value: string; label: string }> = [
  { value: 'email', label: 'Email' },
  { value: 'first_name', label: 'First name' },
  { value: 'last_name', label: 'Last name' },
  { value: 'status', label: 'Status' },
  { value: 'tags', label: 'Tags' },
];

const OPERATORS: Array<{ value: SegmentOperator; label: string }> = [
  { value: 'equals', label: 'equals' },
  { value: 'not_equals', label: 'does not equal' },
  { value: 'contains', label: 'contains' },
  { value: 'not_contains', label: 'does not contain' },
  { value: 'starts_with', label: 'starts with' },
  { value: 'ends_with', label: 'ends with' },
  { value: 'is_empty', label: 'is empty' },
  { value: 'is_not_empty', label: 'is not empty' },
  { value: 'greater_than', label: 'greater than' },
  { value: 'less_than', label: 'less than' },
];

function createEmptyRule(): SegmentRule {
  return { field: 'email', operator: 'contains', value: '' };
}

export function SegmentBuilder({
  adapter,
  initialRules,
  onSave,
  onCancel,
  fields = DEFAULT_FIELDS,
}: SegmentBuilderProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [rules, setRules] = useState<SegmentRule[]>(
    initialRules && initialRules.length > 0 ? initialRules : [createEmptyRule()],
  );
  const [previewCount, setPreviewCount] = useState<number | null>(null);
  const [previewing, setPreviewing] = useState(false);

  const updateRule = (index: number, updates: Partial<SegmentRule>) => {
    setRules((prev) =>
      prev.map((rule, i) => (i === index ? { ...rule, ...updates } : rule)),
    );
    setPreviewCount(null);
  };

  const addRule = () => {
    setRules((prev) => [...prev, createEmptyRule()]);
    setPreviewCount(null);
  };

  const removeRule = (index: number) => {
    setRules((prev) => prev.filter((_, i) => i !== index));
    setPreviewCount(null);
  };

  const handlePreview = useCallback(async () => {
    setPreviewing(true);
    try {
      // Create a temporary segment and count matches
      const result = await adapter.listContacts({ pageSize: 1000 });
      const { evaluateRules } = await import('../segment-evaluator');
      const count = result.data.filter((c) => evaluateRules(c, rules)).length;
      setPreviewCount(count);
    } finally {
      setPreviewing(false);
    }
  }, [adapter, rules]);

  const handleSave = () => {
    if (!name.trim()) return;
    onSave?.(name.trim(), rules, description.trim() || undefined);
  };

  const needsValue = (operator: SegmentOperator) =>
    operator !== 'is_empty' && operator !== 'is_not_empty';

  return (
    <div className="ec-segment-builder">
      <div className="ec-segment-builder__header">
        <label className="ec-segment-builder__field">
          <span>Segment name</span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Active subscribers"
            className="ec-segment-builder__name-input"
          />
        </label>
        <label className="ec-segment-builder__field">
          <span>Description (optional)</span>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe this segment..."
            className="ec-segment-builder__desc-input"
          />
        </label>
      </div>

      <div className="ec-segment-builder__rules">
        <h3>Rules (AND logic - all must match)</h3>
        {rules.map((rule, index) => (
          <div key={index} className="ec-segment-builder__rule">
            <select
              value={rule.field}
              onChange={(e) => updateRule(index, { field: e.target.value })}
              className="ec-segment-builder__rule-field"
            >
              {fields.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>

            <select
              value={rule.operator}
              onChange={(e) => updateRule(index, { operator: e.target.value as SegmentOperator })}
              className="ec-segment-builder__rule-operator"
            >
              {OPERATORS.map((op) => (
                <option key={op.value} value={op.value}>
                  {op.label}
                </option>
              ))}
            </select>

            {needsValue(rule.operator) && (
              <input
                type="text"
                value={rule.value}
                onChange={(e) => updateRule(index, { value: e.target.value })}
                placeholder="Value"
                className="ec-segment-builder__rule-value"
              />
            )}

            {rules.length > 1 && (
              <button
                onClick={() => removeRule(index)}
                className="ec-segment-builder__rule-remove"
              >
                Remove
              </button>
            )}
          </div>
        ))}

        <button onClick={addRule} className="ec-segment-builder__add-rule">
          Add rule
        </button>
      </div>

      <div className="ec-segment-builder__preview">
        <button
          onClick={handlePreview}
          disabled={previewing}
          className="ec-segment-builder__preview-btn"
        >
          {previewing ? 'Counting...' : 'Preview matches'}
        </button>
        {previewCount !== null && (
          <span className="ec-segment-builder__preview-count">
            {previewCount} contact{previewCount !== 1 ? 's' : ''} match
          </span>
        )}
      </div>

      <div className="ec-segment-builder__actions">
        <button
          onClick={handleSave}
          disabled={!name.trim()}
          className="ec-segment-builder__save"
        >
          Save segment
        </button>
        {onCancel && (
          <button onClick={onCancel} className="ec-segment-builder__cancel">
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}
