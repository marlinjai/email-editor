export const CAMPAIGN_TABLES = {
  campaigns: {
    name: 'campaigns',
    columns: [
      { name: 'name', type: 'text' as const, required: true },
      { name: 'template_id', type: 'text' as const, required: true },
      { name: 'segment_id', type: 'text' as const },
      { name: 'status', type: 'select' as const, options: ['draft', 'scheduled', 'sending', 'sent', 'failed', 'cancelled'] },
      { name: 'subject', type: 'text' as const, required: true },
      { name: 'preview_text', type: 'text' as const },
      { name: 'from_name', type: 'text' as const, required: true },
      { name: 'from_email', type: 'text' as const, required: true },
      { name: 'reply_to', type: 'text' as const },
      { name: 'scheduled_at', type: 'text' as const },
      { name: 'sent_at', type: 'text' as const },
      { name: 'send_provider', type: 'text' as const },
      { name: 'ab_test_config', type: 'text' as const },
      { name: 'total_recipients', type: 'number' as const },
    ],
  },
  campaign_recipients: {
    name: 'campaign_recipients',
    columns: [
      { name: 'campaign_id', type: 'text' as const, required: true },
      { name: 'contact_id', type: 'text' as const, required: true },
      { name: 'email', type: 'text' as const, required: true },
      { name: 'status', type: 'select' as const, options: ['pending', 'sent', 'delivered', 'bounced', 'failed'] },
      { name: 'sent_at', type: 'text' as const },
      { name: 'provider_message_id', type: 'text' as const },
    ],
  },
} as const;
