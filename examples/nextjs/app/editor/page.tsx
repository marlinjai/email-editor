// examples/nextjs/app/editor/page.tsx
// Email editor page

'use client';

import { useState, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import type {
  TemplateSnapshotIn,
  TemplateSnapshotOut,
  OnRequestImage,
} from '@marlinjai/email-editor/react';
// The editor's stylesheet is scoped under .ee-root, so it sits beside this
// app's Tailwind 4 styles without either one restyling the other.
import '@marlinjai/email-editor/styles.css';
import { ImagePickerDialog, type PendingImageRequest } from './ImagePickerDialog';

// The editor is browser-only (drag and drop, rich text, MobX): load it on the
// client only. MJML compilation happens server-side in /api/compile.
const EmailEditorReact = dynamic(
  () => import('@marlinjai/email-editor/react').then((mod) => mod.EmailEditorReact),
  {
    ssr: false,
    loading: () => (
      <div style={{ flex: 1, display: 'grid', placeItems: 'center', color: 'var(--muted)' }}>Loading editor...</div>
    ),
  }
);

// The editor chrome uses this app's font: a theme sets design tokens on the
// editor's root element only.
const editorTheme = { fonts: { body: 'var(--font-jakarta), system-ui, sans-serif' } };

/**
 * Default template
 */
const defaultTemplate: TemplateSnapshotIn = {
  id: 'default-template',
  version: '1.1',
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
  const [imageRequest, setImageRequest] = useState<PendingImageRequest | null>(null);

  // The editor asks for an image; this host answers from its own picker.
  const handleRequestImage = useCallback<OnRequestImage>(
    (request) => new Promise((resolve, reject) => setImageRequest({ request, resolve, reject })),
    []
  );

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
      } else {
        const reason = result.error ?? (Array.isArray(result.errors) ? result.errors[0] : undefined) ?? 'unknown error';
        setSaveStatus(`Export failed: ${reason}`);
        setTimeout(() => setSaveStatus(''), 6000);
      }
    } catch (err) {
      console.error('Export failed:', err);
      setSaveStatus('Export failed: the compile route did not answer');
      setTimeout(() => setSaveStatus(''), 6000);
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
      <div style={{ flex: 1, minHeight: 0 }}>
        <EmailEditorReact
          initialTemplate={defaultTemplate}
          onChange={handleTemplateChange}
          onSave={handleSave}
          onExport={handleExport}
          onNavigateBack={() => router.push('/dashboard')}
          onRequestImage={handleRequestImage}
          theme={editorTheme}
        />
      </div>
      {imageRequest && <ImagePickerDialog pending={imageRequest} onDone={() => setImageRequest(null)} />}
    </div>
  );
}
