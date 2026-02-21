// examples/nextjs/app/editor/page.tsx
// Email editor page

'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { EmailEditorReact, type TemplateSnapshotIn, type TemplateSnapshotOut } from '@marlinjai/email-editor/react';

/**
 * Default template
 */
const defaultTemplate: TemplateSnapshotIn = {
  id: 'default-template',
  version: '1.0',
  metadata: {
    title: 'Untitled Template',
    subject: 'Your Email Subject',
    previewText: 'Preview text shown in inbox',
  },
  sections: [],
};

export default function EditorPage() {
  const router = useRouter();
  const [currentTemplate, setCurrentTemplate] = useState<TemplateSnapshotOut | null>(null);
  const [saveStatus, setSaveStatus] = useState<string>('');

  // Handle template changes
  const handleTemplateChange = useCallback((newTemplate: TemplateSnapshotOut) => {
    setCurrentTemplate(newTemplate);
  }, []);

  // Handle export - compile to MJML on server
  const handleExport = useCallback(async (template: TemplateSnapshotOut) => {
    try {
      const response = await fetch('/api/compile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(template),
      });
      const result = await response.json();
      if (result.success) {
        // Download the HTML
        const blob = new Blob([result.html], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${template.metadata?.title || 'email'}.html`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      console.error('Export failed:', err);
    }
  }, []);

  const handleSave = useCallback(async () => {
    if (!currentTemplate) {
      setSaveStatus('No changes to save');
      setTimeout(() => setSaveStatus(''), 3000);
      return;
    }

    setSaveStatus('Saving...');

    try {
      // Update timestamp
      const templateToSave = {
        ...currentTemplate,
        metadata: {
          ...currentTemplate.metadata,
          updatedAt: new Date(),
        },
      };

      // Send to API route for server-side compilation and saving
      const response = await fetch('/api/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(templateToSave),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();

      if (result.success) {
        setSaveStatus('Saved successfully!');
        setTimeout(() => setSaveStatus(''), 3000);
      } else {
        setSaveStatus('Error: ' + (result.error || 'Unknown error'));
        setTimeout(() => setSaveStatus(''), 3000);
      }
    } catch (error) {
      console.error('Save failed:', error);
      setSaveStatus('Error saving: ' + (error instanceof Error ? error.message : 'Unknown'));
      setTimeout(() => setSaveStatus(''), 3000);
    }
  }, [currentTemplate]);

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      {saveStatus && (
        <div
          style={{
            padding: '12px',
            textAlign: 'center',
            background: saveStatus.includes('Error') ? 'var(--danger-muted)' : 'var(--success-muted)',
            color: saveStatus.includes('Error') ? 'var(--danger)' : 'var(--success)',
          }}
        >
          {saveStatus}
        </div>
      )}
      <EmailEditorReact
        initialTemplate={defaultTemplate}
        onChange={handleTemplateChange}
        onSave={handleSave}
        onExport={handleExport}
        onNavigateBack={() => router.push('/dashboard')}
      />
    </div>
  );
}
