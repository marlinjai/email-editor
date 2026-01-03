// examples/nextjs/app/page.tsx
// Main page with email editor

'use client';

import { useState } from 'react';
import { EmailEditorReact } from '@returnhypnosis/email-editor/react';
import type { EmailTemplate } from '@returnhypnosis/email-editor';

/**
 * Default template with ReTurn branding
 */
const defaultTemplate: EmailTemplate = {
  version: '1.0',
  metadata: {
    subject: 'Welcome to ReTurn Newsletter',
    previewText: 'Monthly insights on hypnosis and personal transformation',
  },
  sections: [],
};

/**
 * ReTurn theme configuration
 */
const returnTheme = {
  colors: {
    primary: '#944923',
    surface: '#ffffff',
    text: '#1a1a1a',
    border: '#e5e5e5',
  },
  fonts: {
    heading: 'Georgia, serif',
    body: 'Georgia, serif',
  },
};

export default function HomePage() {
  const [template, setTemplate] = useState<EmailTemplate>(defaultTemplate);
  const [saveStatus, setSaveStatus] = useState<string>('');

  const handleSave = async () => {
    setSaveStatus('Saving...');

    try {
      // Send to API route for server-side compilation
      const response = await fetch('/api/compile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(template),
      });

      const result = await response.json();

      if (result.success) {
        setSaveStatus('Saved successfully!');
        console.log('Compiled HTML:', result.html);
        console.log('MJML:', result.mjml);
        
        // Clear status after 2 seconds
        setTimeout(() => setSaveStatus(''), 2000);
      } else {
        setSaveStatus('Error saving');
      }
    } catch (error) {
      console.error('Save failed:', error);
      setSaveStatus('Error saving');
    }
  };

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      {saveStatus && (
        <div
          style={{
            padding: '12px',
            textAlign: 'center',
            background: saveStatus.includes('Error') ? '#fee' : '#efe',
            color: saveStatus.includes('Error') ? '#c33' : '#363',
          }}
        >
          {saveStatus}
        </div>
      )}
      <EmailEditorReact
        value={template}
        onChange={setTemplate}
        theme={returnTheme}
        onSave={handleSave}
      />
    </div>
  );
}

