// packages/ui/src/sidebar/TemplateSettingsPanel.tsx
// Template metadata settings

import React, { useState } from 'react';
import { observer } from 'mobx-react-lite';
import { useStore } from '../store';
import { Plus, Trash2 } from 'lucide-react';

export const TemplateSettingsPanel = observer(function TemplateSettingsPanel() {
  const { template } = useStore();

  return (
    <div className="p-4 space-y-4">
      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
        Email Settings
      </h3>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Subject Line
        </label>
        <input
          type="text"
          value={template.metadata.subject}
          onChange={(e) => template.updateMetadata({ subject: e.target.value })}
          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="Email subject..."
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Preview Text
        </label>
        <textarea
          value={template.metadata.previewText}
          onChange={(e) => template.updateMetadata({ previewText: e.target.value })}
          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          rows={3}
          placeholder="Text shown in inbox preview..."
        />
        <p className="mt-1 text-xs text-gray-500">
          This text appears after the subject line in email clients.
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Mobile Breakpoint
        </label>
        <input
          type="text"
          value={template.metadata.breakpoint || ''}
          onChange={(e) => template.updateMetadata({ breakpoint: e.target.value || undefined })}
          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="480px"
        />
        <p className="mt-1 text-xs text-gray-500">
          Width at which email switches to mobile layout.
        </p>
      </div>

      <hr className="my-4 border-gray-200" />

      <ThemeColorsSection />

      <hr className="my-4 border-gray-200" />

      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
        Custom Styles
      </h3>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Custom CSS
        </label>
        <textarea
          value={template.metadata.customCSS || ''}
          onChange={(e) => template.updateMetadata({ customCSS: e.target.value || undefined })}
          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
          rows={4}
          placeholder=".my-class { color: red; }"
        />
      </div>

      <hr className="my-4 border-gray-200" />

      <div className="text-xs text-gray-500">
        <strong>Last updated:</strong>{' '}
        {new Date(template.metadata.updatedAt).toLocaleString()}
      </div>
    </div>
  );
});

/**
 * Theme Colors management section
 */
const ThemeColorsSection = observer(function ThemeColorsSection() {
  const { template } = useStore();
  const [newColorName, setNewColorName] = useState('');

  const handleAddColor = () => {
    const name = newColorName.trim() || `Color ${template.metadata.themeColors.length + 1}`;
    template.metadata.addThemeColor(name, '#666666');
    setNewColorName('');
  };

  return (
    <div>
      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
        Theme Colors
      </h3>
      <p className="text-xs text-gray-500 mb-3">
        Define reusable brand colors for your email.
      </p>

      <div className="space-y-2">
        {template.metadata.themeColors.map((color) => (
          <div key={color.name} className="flex items-center gap-2">
            <input
              type="color"
              value={color.value}
              onChange={(e) => template.metadata.updateThemeColor(color.name, e.target.value)}
              className="w-8 h-8 rounded border border-gray-300 cursor-pointer"
            />
            <span className="flex-1 text-sm text-gray-700">{color.name}</span>
            <span className="text-xs text-gray-400 font-mono">{color.value}</span>
            <button
              onClick={() => template.metadata.removeThemeColor(color.name)}
              className="p-1 hover:bg-red-50 text-red-500 rounded opacity-50 hover:opacity-100"
              title="Remove color"
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>

      <div className="mt-3 flex gap-2">
        <input
          type="text"
          value={newColorName}
          onChange={(e) => setNewColorName(e.target.value)}
          placeholder="Color name..."
          className="flex-1 px-2 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleAddColor();
          }}
        />
        <button
          onClick={handleAddColor}
          className="px-3 py-1.5 text-sm bg-blue-500 text-white rounded hover:bg-blue-600 flex items-center gap-1"
        >
          <Plus size={14} />
          Add
        </button>
      </div>
    </div>
  );
});
