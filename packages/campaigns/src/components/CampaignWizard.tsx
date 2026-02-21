import React, { useState, useCallback } from 'react';
import type { CreateCampaignInput, ScheduleCampaignInput } from '../types';
import type { Template, TemplateListOptions } from '@marlinjai/email-templates';
import type { Segment } from '@marlinjai/email-contacts';

type WizardStep = 'template' | 'audience' | 'configure' | 'review';

const STEPS: WizardStep[] = ['template', 'audience', 'configure', 'review'];

const STEP_LABELS: Record<WizardStep, string> = {
  template: 'Select Template',
  audience: 'Select Audience',
  configure: 'Configure',
  review: 'Review & Send',
};

export interface CampaignWizardProps {
  templates: Template[];
  segments: Segment[];
  onLoadTemplates?: (options?: TemplateListOptions) => Promise<void>;
  onSend: (input: CreateCampaignInput) => Promise<void>;
  onSchedule: (input: CreateCampaignInput, schedule: ScheduleCampaignInput) => Promise<void>;
  onSendTest?: (input: CreateCampaignInput, testEmail: string) => Promise<void>;
  onCancel?: () => void;
  defaultFromName?: string;
  defaultFromEmail?: string;
}

export function CampaignWizard({
  templates,
  segments,
  onSend,
  onSchedule,
  onSendTest,
  onCancel,
  defaultFromName = '',
  defaultFromEmail = '',
}: CampaignWizardProps) {
  const [step, setStep] = useState<WizardStep>('template');
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [selectedSegmentId, setSelectedSegmentId] = useState('');
  const [name, setName] = useState('');
  const [subject, setSubject] = useState('');
  const [previewText, setPreviewText] = useState('');
  const [fromName, setFromName] = useState(defaultFromName);
  const [fromEmail, setFromEmail] = useState(defaultFromEmail);
  const [replyTo, setReplyTo] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [testEmail, setTestEmail] = useState('');
  const [sending, setSending] = useState(false);

  const currentStepIndex = STEPS.indexOf(step);

  const canGoNext = useCallback(() => {
    switch (step) {
      case 'template':
        return selectedTemplateId !== '';
      case 'audience':
        return true; // segment is optional
      case 'configure':
        return name !== '' && subject !== '' && fromName !== '' && fromEmail !== '';
      case 'review':
        return true;
      default:
        return false;
    }
  }, [step, selectedTemplateId, name, subject, fromName, fromEmail]);

  const goNext = () => {
    const idx = STEPS.indexOf(step);
    if (idx < STEPS.length - 1) setStep(STEPS[idx + 1]!);
  };

  const goBack = () => {
    const idx = STEPS.indexOf(step);
    if (idx > 0) setStep(STEPS[idx - 1]!);
  };

  const buildInput = (): CreateCampaignInput => ({
    name,
    templateId: selectedTemplateId,
    segmentId: selectedSegmentId || undefined,
    subject,
    previewText: previewText || undefined,
    fromName,
    fromEmail,
    replyTo: replyTo || undefined,
  });

  const handleSend = async () => {
    setSending(true);
    try {
      await onSend(buildInput());
    } finally {
      setSending(false);
    }
  };

  const handleSchedule = async () => {
    if (!scheduledAt) return;
    setSending(true);
    try {
      await onSchedule(buildInput(), { scheduledAt });
    } finally {
      setSending(false);
    }
  };

  const handleSendTest = async () => {
    if (!testEmail || !onSendTest) return;
    setSending(true);
    try {
      await onSendTest(buildInput(), testEmail);
    } finally {
      setSending(false);
    }
  };

  const selectedTemplate = templates.find((t) => t.id === selectedTemplateId);
  const selectedSegment = segments.find((s) => s.id === selectedSegmentId);

  return (
    <div className="ec-campaign-wizard">
      {/* Step Indicator */}
      <div className="ec-campaign-wizard__steps">
        {STEPS.map((s, i) => (
          <div
            key={s}
            className={`ec-campaign-wizard__step ${i === currentStepIndex ? 'ec-campaign-wizard__step--active' : ''} ${i < currentStepIndex ? 'ec-campaign-wizard__step--completed' : ''}`}
          >
            <span className="ec-campaign-wizard__step-number">{i + 1}</span>
            <span className="ec-campaign-wizard__step-label">{STEP_LABELS[s]}</span>
          </div>
        ))}
      </div>

      {/* Step Content */}
      <div className="ec-campaign-wizard__content">
        {step === 'template' && (
          <div className="ec-campaign-wizard__template-step">
            <h3>Select a Template</h3>
            <div className="ec-campaign-wizard__template-grid">
              {templates.map((template) => (
                <div
                  key={template.id}
                  className={`ec-campaign-wizard__template-card ${selectedTemplateId === template.id ? 'ec-campaign-wizard__template-card--selected' : ''}`}
                  onClick={() => setSelectedTemplateId(template.id)}
                >
                  <div className="ec-campaign-wizard__template-name">{template.name}</div>
                  {template.description && (
                    <div className="ec-campaign-wizard__template-desc">{template.description}</div>
                  )}
                  <span className={`ec-campaign-wizard__template-status ec-campaign-wizard__template-status--${template.status}`}>
                    {template.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {step === 'audience' && (
          <div className="ec-campaign-wizard__audience-step">
            <h3>Select Audience</h3>
            <div className="ec-campaign-wizard__segment-list">
              <div
                className={`ec-campaign-wizard__segment-card ${selectedSegmentId === '' ? 'ec-campaign-wizard__segment-card--selected' : ''}`}
                onClick={() => setSelectedSegmentId('')}
              >
                <div className="ec-campaign-wizard__segment-name">All Contacts</div>
                <div className="ec-campaign-wizard__segment-desc">Send to all active contacts</div>
              </div>
              {segments.map((segment) => (
                <div
                  key={segment.id}
                  className={`ec-campaign-wizard__segment-card ${selectedSegmentId === segment.id ? 'ec-campaign-wizard__segment-card--selected' : ''}`}
                  onClick={() => setSelectedSegmentId(segment.id)}
                >
                  <div className="ec-campaign-wizard__segment-name">{segment.name}</div>
                  <div className="ec-campaign-wizard__segment-count">{segment.contactCount} contacts</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {step === 'configure' && (
          <div className="ec-campaign-wizard__configure-step">
            <h3>Campaign Settings</h3>
            <div className="ec-campaign-wizard__form">
              <label className="ec-campaign-wizard__field">
                <span>Campaign Name *</span>
                <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="My Campaign" />
              </label>
              <label className="ec-campaign-wizard__field">
                <span>Subject Line *</span>
                <input type="text" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Your email subject" />
              </label>
              <label className="ec-campaign-wizard__field">
                <span>Preview Text</span>
                <input type="text" value={previewText} onChange={(e) => setPreviewText(e.target.value)} placeholder="Preview text shown in inbox" />
              </label>
              <label className="ec-campaign-wizard__field">
                <span>From Name *</span>
                <input type="text" value={fromName} onChange={(e) => setFromName(e.target.value)} placeholder="Your Name" />
              </label>
              <label className="ec-campaign-wizard__field">
                <span>From Email *</span>
                <input type="email" value={fromEmail} onChange={(e) => setFromEmail(e.target.value)} placeholder="you@example.com" />
              </label>
              <label className="ec-campaign-wizard__field">
                <span>Reply-To Email</span>
                <input type="email" value={replyTo} onChange={(e) => setReplyTo(e.target.value)} placeholder="reply@example.com" />
              </label>
            </div>
          </div>
        )}

        {step === 'review' && (
          <div className="ec-campaign-wizard__review-step">
            <h3>Review Campaign</h3>
            <dl className="ec-campaign-wizard__review-list">
              <dt>Campaign Name</dt>
              <dd>{name}</dd>
              <dt>Template</dt>
              <dd>{selectedTemplate?.name ?? 'Unknown'}</dd>
              <dt>Audience</dt>
              <dd>{selectedSegment ? `${selectedSegment.name} (${selectedSegment.contactCount} contacts)` : 'All Contacts'}</dd>
              <dt>Subject</dt>
              <dd>{subject}</dd>
              {previewText && (
                <>
                  <dt>Preview Text</dt>
                  <dd>{previewText}</dd>
                </>
              )}
              <dt>From</dt>
              <dd>{fromName} &lt;{fromEmail}&gt;</dd>
              {replyTo && (
                <>
                  <dt>Reply-To</dt>
                  <dd>{replyTo}</dd>
                </>
              )}
            </dl>

            {/* Send Test */}
            {onSendTest && (
              <div className="ec-campaign-wizard__test-send">
                <h4>Send Test Email</h4>
                <div className="ec-campaign-wizard__test-send-row">
                  <input
                    type="email"
                    value={testEmail}
                    onChange={(e) => setTestEmail(e.target.value)}
                    placeholder="test@example.com"
                  />
                  <button onClick={handleSendTest} disabled={sending || !testEmail}>
                    Send Test
                  </button>
                </div>
              </div>
            )}

            {/* Schedule */}
            <div className="ec-campaign-wizard__schedule">
              <h4>Schedule</h4>
              <input
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
              />
              <button onClick={handleSchedule} disabled={sending || !scheduledAt}>
                Schedule
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="ec-campaign-wizard__nav">
        {onCancel && (
          <button onClick={onCancel} className="ec-campaign-wizard__cancel-btn">
            Cancel
          </button>
        )}
        <div className="ec-campaign-wizard__nav-right">
          {currentStepIndex > 0 && (
            <button onClick={goBack} className="ec-campaign-wizard__back-btn">
              Back
            </button>
          )}
          {step === 'review' ? (
            <button onClick={handleSend} disabled={sending} className="ec-campaign-wizard__send-btn">
              {sending ? 'Sending...' : 'Send Now'}
            </button>
          ) : (
            <button onClick={goNext} disabled={!canGoNext()} className="ec-campaign-wizard__next-btn">
              Next
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
