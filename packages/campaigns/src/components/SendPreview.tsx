import React, { useState } from 'react';

export interface SendPreviewProps {
  html: string;
  onSendTest?: (email: string) => Promise<void>;
}

export function SendPreview({ html, onSendTest }: SendPreviewProps) {
  const [testEmail, setTestEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  const handleSendTest = async () => {
    if (!testEmail || !onSendTest) return;
    setSending(true);
    setResult(null);
    try {
      await onSendTest(testEmail);
      setResult({ success: true, message: `Test email sent to ${testEmail}` });
    } catch (err) {
      setResult({ success: false, message: err instanceof Error ? err.message : 'Failed to send test email' });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="ec-send-preview">
      {/* Email Preview */}
      <div className="ec-send-preview__frame-container">
        <iframe
          className="ec-send-preview__frame"
          srcDoc={html}
          title="Email Preview"
          sandbox="allow-same-origin"
        />
      </div>

      {/* Test Send */}
      {onSendTest && (
        <div className="ec-send-preview__test">
          <h4>Send Test Email</h4>
          <div className="ec-send-preview__test-row">
            <input
              type="email"
              value={testEmail}
              onChange={(e) => setTestEmail(e.target.value)}
              placeholder="test@example.com"
              className="ec-send-preview__test-input"
            />
            <button
              onClick={handleSendTest}
              disabled={sending || !testEmail}
              className="ec-send-preview__test-btn"
            >
              {sending ? 'Sending...' : 'Send Test'}
            </button>
          </div>
          {result && (
            <div
              className={`ec-send-preview__result ${result.success ? 'ec-send-preview__result--success' : 'ec-send-preview__result--error'}`}
            >
              {result.message}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
