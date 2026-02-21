import React from 'react';
import type { CreateTemplateInput } from '../types';

export interface CreateTemplateDialogProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (input: CreateTemplateInput) => void;
  categories?: string[];
}

const DEFAULT_CATEGORIES = ['Marketing', 'Newsletter', 'Transactional', 'Notification', 'Other'];

export function CreateTemplateDialog({
  open,
  onClose,
  onSubmit,
  categories = DEFAULT_CATEGORIES,
}: CreateTemplateDialogProps) {
  const [name, setName] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [category, setCategory] = React.useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    onSubmit({
      name: name.trim(),
      description: description.trim() || undefined,
      category: category || undefined,
      templateJson: '{}',
    });

    setName('');
    setDescription('');
    setCategory('');
    onClose();
  };

  if (!open) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          background: 'white',
          borderRadius: 12,
          padding: 24,
          width: '100%',
          maxWidth: 480,
          boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
        }}
      >
        <h2 style={{ margin: '0 0 20px', fontSize: 18, fontWeight: 600 }}>Create New Template</h2>
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>
              Name <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Template"
              style={inputStyle}
              required
              autoFocus
            />
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What is this template for?"
              style={{ ...inputStyle, minHeight: 80, resize: 'vertical' }}
            />
          </div>

          <div style={{ marginBottom: 24 }}>
            <label style={labelStyle}>Category</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              style={inputStyle}
            >
              <option value="">Select a category</option>
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '8px 16px',
                border: '1px solid #e2e8f0',
                borderRadius: 6,
                background: 'white',
                fontSize: 14,
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim()}
              style={{
                padding: '8px 16px',
                border: 'none',
                borderRadius: 6,
                background: name.trim() ? '#3b82f6' : '#94a3b8',
                color: 'white',
                fontSize: 14,
                fontWeight: 500,
                cursor: name.trim() ? 'pointer' : 'not-allowed',
              }}
            >
              Create Template
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  marginBottom: 4,
  fontSize: 13,
  fontWeight: 500,
  color: '#374151',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  border: '1px solid #e2e8f0',
  borderRadius: 6,
  fontSize: 14,
  boxSizing: 'border-box',
};
