import React, { useState } from 'react';
import type { AutomationStep, StepConfig, StepType } from '../types';

export interface SequenceBuilderProps {
  steps: AutomationStep[];
  onAddStep: (config: StepConfig, afterStepId?: string) => void;
  onUpdateStep: (stepId: string, config: StepConfig) => void;
  onRemoveStep: (stepId: string) => void;
  onReorderSteps?: (stepIds: string[]) => void;
  readOnly?: boolean;
}

const STEP_TYPE_LABELS: Record<StepType, string> = {
  send_email: 'Send Email',
  wait: 'Wait / Delay',
  condition: 'If / Else',
  split: 'A/B Split',
};

const STEP_TYPE_COLORS: Record<StepType, string> = {
  send_email: '#3b82f6',
  wait: '#f59e0b',
  condition: '#8b5cf6',
  split: '#ec4899',
};

export function SequenceBuilder({
  steps,
  onAddStep,
  onUpdateStep,
  onRemoveStep,
  readOnly = false,
}: SequenceBuilderProps) {
  const [addingAfter, setAddingAfter] = useState<string | null>(null);
  const [editingStep, setEditingStep] = useState<string | null>(null);

  const sorted = [...steps].sort((a, b) => a.position - b.position);

  const handleAddStep = (type: StepType, afterStepId?: string) => {
    const config = getDefaultConfig(type);
    onAddStep(config, afterStepId);
    setAddingAfter(null);
  };

  return (
    <div style={{ padding: 16 }}>
      {sorted.length === 0 && !readOnly && (
        <div style={{ textAlign: 'center', padding: 32, color: '#94a3b8' }}>
          <p>No steps yet. Add the first step to your automation.</p>
          <StepTypeSelector onSelect={(type) => handleAddStep(type)} />
        </div>
      )}

      {sorted.map((step, index) => (
        <React.Fragment key={step.id}>
          <StepCard
            step={step}
            isEditing={editingStep === step.id}
            onEdit={() => setEditingStep(editingStep === step.id ? null : step.id)}
            onUpdate={(config) => { onUpdateStep(step.id, config); setEditingStep(null); }}
            onRemove={() => onRemoveStep(step.id)}
            readOnly={readOnly}
          />

          {/* Connector line */}
          {index < sorted.length - 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '4px 0' }}>
              <div style={{ width: 2, height: 24, background: '#e2e8f0' }} />
            </div>
          )}

          {/* Add step button between steps */}
          {!readOnly && (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '4px 0' }}>
              {addingAfter === step.id ? (
                <StepTypeSelector onSelect={(type) => handleAddStep(type, step.id)} onCancel={() => setAddingAfter(null)} />
              ) : (
                <button
                  onClick={() => setAddingAfter(step.id)}
                  style={{
                    background: 'none',
                    border: '1px dashed #cbd5e1',
                    borderRadius: 6,
                    padding: '4px 12px',
                    cursor: 'pointer',
                    fontSize: 12,
                    color: '#94a3b8',
                  }}
                >
                  + Add Step
                </button>
              )}
            </div>
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

// ─── Step Card ─────────────────────────────────────────────────

interface StepCardProps {
  step: AutomationStep;
  isEditing: boolean;
  onEdit: () => void;
  onUpdate: (config: StepConfig) => void;
  onRemove: () => void;
  readOnly: boolean;
}

function StepCard({ step, isEditing, onEdit, onUpdate, onRemove, readOnly }: StepCardProps) {
  const color = STEP_TYPE_COLORS[step.config.type];
  const label = STEP_TYPE_LABELS[step.config.type];

  return (
    <div
      style={{
        border: `1px solid ${color}40`,
        borderLeft: `3px solid ${color}`,
        borderRadius: 6,
        padding: 12,
        background: 'white',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span
            style={{
              display: 'inline-block',
              padding: '2px 8px',
              borderRadius: 4,
              fontSize: 11,
              fontWeight: 600,
              background: `${color}20`,
              color,
            }}
          >
            {label}
          </span>
          <span style={{ fontSize: 13, color: '#64748b' }}>
            {getStepSummary(step.config)}
          </span>
        </div>
        {!readOnly && (
          <div style={{ display: 'flex', gap: 4 }}>
            <button onClick={onEdit} style={iconBtnStyle}>
              {isEditing ? 'Done' : 'Edit'}
            </button>
            <button onClick={onRemove} style={{ ...iconBtnStyle, color: '#ef4444' }}>
              Remove
            </button>
          </div>
        )}
      </div>

      {isEditing && (
        <StepEditor config={step.config} onSave={onUpdate} />
      )}
    </div>
  );
}

// ─── Step Editor ───────────────────────────────────────────────

interface StepEditorProps {
  config: StepConfig;
  onSave: (config: StepConfig) => void;
}

function StepEditor({ config, onSave }: StepEditorProps) {
  const [draft, setDraft] = useState(config);

  if (draft.type === 'send_email') {
    return (
      <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <label style={labelStyle}>
          Template ID
          <input
            style={inputStyle}
            value={draft.templateId}
            onChange={(e) => setDraft({ ...draft, templateId: e.target.value })}
          />
        </label>
        <label style={labelStyle}>
          Subject (override)
          <input
            style={inputStyle}
            value={draft.subject ?? ''}
            onChange={(e) => setDraft({ ...draft, subject: e.target.value || undefined })}
          />
        </label>
        <button onClick={() => onSave(draft)} style={saveBtnStyle}>Save</button>
      </div>
    );
  }

  if (draft.type === 'wait') {
    return (
      <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <label style={labelStyle}>
          Delay (minutes)
          <input
            type="number"
            style={inputStyle}
            value={draft.delayMinutes}
            onChange={(e) => setDraft({ ...draft, delayMinutes: Number(e.target.value) })}
            min={1}
          />
        </label>
        <button onClick={() => onSave(draft)} style={saveBtnStyle}>Save</button>
      </div>
    );
  }

  if (draft.type === 'condition') {
    return (
      <div style={{ marginTop: 12, color: '#64748b', fontSize: 12 }}>
        <p>Condition editor: {draft.branches.length} branch(es) configured.</p>
        <button onClick={() => onSave(draft)} style={saveBtnStyle}>Save</button>
      </div>
    );
  }

  if (draft.type === 'split') {
    return (
      <div style={{ marginTop: 12, color: '#64748b', fontSize: 12 }}>
        <p>A/B Split: {draft.variants.length} variant(s) configured.</p>
        <button onClick={() => onSave(draft)} style={saveBtnStyle}>Save</button>
      </div>
    );
  }

  return null;
}

// ─── Step Type Selector ────────────────────────────────────────

interface StepTypeSelectorProps {
  onSelect: (type: StepType) => void;
  onCancel?: () => void;
}

function StepTypeSelector({ onSelect, onCancel }: StepTypeSelectorProps) {
  const types: StepType[] = ['send_email', 'wait', 'condition', 'split'];
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
      {types.map((type) => (
        <button
          key={type}
          onClick={() => onSelect(type)}
          style={{
            padding: '6px 12px',
            border: `1px solid ${STEP_TYPE_COLORS[type]}40`,
            borderRadius: 6,
            background: `${STEP_TYPE_COLORS[type]}10`,
            color: STEP_TYPE_COLORS[type],
            cursor: 'pointer',
            fontSize: 12,
            fontWeight: 500,
          }}
        >
          {STEP_TYPE_LABELS[type]}
        </button>
      ))}
      {onCancel && (
        <button onClick={onCancel} style={{ ...iconBtnStyle, fontSize: 12 }}>
          Cancel
        </button>
      )}
    </div>
  );
}

// ─── Helpers ───────────────────────────────────────────────────

function getDefaultConfig(type: StepType): StepConfig {
  switch (type) {
    case 'send_email':
      return { type: 'send_email', templateId: '' };
    case 'wait':
      return { type: 'wait', delayMinutes: 60 };
    case 'condition':
      return {
        type: 'condition',
        branches: [
          { id: 'branch-yes', label: 'Yes', rules: [] },
          { id: 'branch-no', label: 'No', rules: [] },
        ],
      };
    case 'split':
      return {
        type: 'split',
        variants: [
          { id: 'variant-a', label: 'A', percentage: 50 },
          { id: 'variant-b', label: 'B', percentage: 50 },
        ],
      };
  }
}

function getStepSummary(config: StepConfig): string {
  switch (config.type) {
    case 'send_email':
      return config.subject ? `"${config.subject}"` : `Template: ${config.templateId || '(not set)'}`;
    case 'wait': {
      if (config.delayMinutes < 60) return `Wait ${config.delayMinutes}m`;
      if (config.delayMinutes < 1440) return `Wait ${Math.round(config.delayMinutes / 60)}h`;
      return `Wait ${Math.round(config.delayMinutes / 1440)}d`;
    }
    case 'condition':
      return `${config.branches.length} branch(es)`;
    case 'split':
      return config.variants.map((v) => `${v.label}: ${v.percentage}%`).join(', ');
  }
}

const iconBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  fontSize: 12,
  color: '#64748b',
  padding: '2px 6px',
};

const labelStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  fontSize: 12,
  color: '#64748b',
};

const inputStyle: React.CSSProperties = {
  padding: '6px 8px',
  border: '1px solid #e2e8f0',
  borderRadius: 4,
  fontSize: 13,
};

const saveBtnStyle: React.CSSProperties = {
  padding: '6px 16px',
  background: '#3b82f6',
  color: 'white',
  border: 'none',
  borderRadius: 4,
  cursor: 'pointer',
  fontSize: 12,
  fontWeight: 500,
  alignSelf: 'flex-start',
};
