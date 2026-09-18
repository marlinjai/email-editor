/** Shared valid fixtures for the schema tests. Not exported from the package. */

export const TS = '2026-09-18T12:00:00.000Z';
export const TS_OFFSET = '2026-09-18T14:00:00+02:00';

export const doc = {
  version: '1.0' as const,
  metadata: { name: 'Welcome' },
  sections: [{ id: 's1', columns: [] }],
};

export const counts = { total: 3, queued: 1, sending: 0, sent: 1, failed: 0, skipped: 1 };

export const mailing = {
  id: 'mlg_1',
  name: null,
  subject: 'Programme update',
  preheader: null,
  template_id: null,
  document: doc,
  topic: 'programme-updates',
  provider_id: 'prv_1',
  status: 'sending' as const,
  counts,
  metadata: { sent_by: 'person_1' },
  scheduled_at: null,
  ab_test: null,
  started_at: TS,
  finished_at: null,
  created_at: TS,
  updated_at: TS,
};

export const contact = {
  id: 'ctc_1',
  external_id: 'person_1',
  email: 'ada@example.com',
  first_name: 'Ada',
  last_name: null,
  locale: 'de',
  properties: { gathering: 'autumn', nested: { a: [1, true, null] } },
  topics: ['programme-updates'],
  tags: ['founders'],
  created_at: TS,
  updated_at: TS,
};

export const smtpProvider = {
  id: 'prv_1',
  kind: 'smtp' as const,
  config: { host: 'smtp.mail.me.com', port: 587, security: 'starttls' as const, username: 'hello@example.com' },
  has_secret: true,
  name: 'iCloud',
  from_name: 'Example',
  from_email: 'hello@example.com',
  reply_to: null,
  policy: { daily_recipient_budget: 800, min_interval_ms: 3000, max_recipients_per_message: 1 },
  created_at: TS,
  updated_at: TS,
};
