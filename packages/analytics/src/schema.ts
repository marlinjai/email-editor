export const ANALYTICS_TABLES = {
  tracking_events: {
    name: 'tracking_events',
    columns: [
      { name: 'campaign_id', type: 'text' as const, required: true },
      { name: 'contact_id', type: 'text' as const, required: true },
      { name: 'type', type: 'select' as const, options: ['open', 'click', 'bounce', 'unsubscribe', 'complaint', 'delivered'] },
      { name: 'url', type: 'text' as const },
      { name: 'user_agent', type: 'text' as const },
      { name: 'ip_address', type: 'text' as const },
      { name: 'timestamp', type: 'text' as const, required: true },
    ],
  },
  campaign_stats: {
    name: 'campaign_stats',
    columns: [
      { name: 'campaign_id', type: 'text' as const, required: true },
      { name: 'total_sent', type: 'number' as const },
      { name: 'total_delivered', type: 'number' as const },
      { name: 'total_opens', type: 'number' as const },
      { name: 'unique_opens', type: 'number' as const },
      { name: 'total_clicks', type: 'number' as const },
      { name: 'unique_clicks', type: 'number' as const },
      { name: 'total_bounces', type: 'number' as const },
      { name: 'total_unsubscribes', type: 'number' as const },
      { name: 'total_complaints', type: 'number' as const },
      { name: 'open_rate', type: 'number' as const },
      { name: 'click_rate', type: 'number' as const },
      { name: 'click_to_open_rate', type: 'number' as const },
      { name: 'bounce_rate', type: 'number' as const },
      { name: 'unsubscribe_rate', type: 'number' as const },
    ],
  },
} as const;
