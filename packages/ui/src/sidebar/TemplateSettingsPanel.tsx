// packages/ui/src/sidebar/TemplateSettingsPanel.tsx
// Template metadata settings

import React from 'react';
import { observer } from 'mobx-react-lite';
import { useStore } from '../store';

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
