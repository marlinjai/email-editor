import { describe, expect, it } from 'vitest';
import {
  MAILING_ACTIONS,
  MAILING_STATUSES,
  MAILING_TRANSITIONS,
  MAX_RECIPIENTS_PER_BATCH,
  Mailing,
  MailingCreate,
  MailingMetadata,
  MailingRetryFailedRequest,
  MailingSendRequest,
  MailingSummary,
  MailingTestRequest,
  MailingUpdate,
  Message,
  MessageSummary,
  Recipient,
  RecipientBatch,
  RecipientBatchResult,
  RecipientInput,
  RecipientListQuery,
  SKIP_REASONS,
  TERMINAL_MAILING_STATUSES,
  canTransition,
} from './mailings';
import { TS, doc, mailing } from './test-fixtures';

describe('mailing state machine', () => {
  it('lists every status and only known actions', () => {
    expect(Object.keys(MAILING_TRANSITIONS).sort()).toEqual([...MAILING_STATUSES].sort());
    for (const actions of Object.values(MAILING_TRANSITIONS)) {
      for (const a of actions) expect(MAILING_ACTIONS).toContain(a);
    }
  });

  it('allows the documented transitions', () => {
    expect(canTransition('draft', 'send')).toBe(true);
    expect(canTransition('scheduled', 'send')).toBe(true);
    expect(canTransition('sending', 'pause')).toBe(true);
    expect(canTransition('paused', 'resume')).toBe(true);
    expect(canTransition('sending', 'cancel')).toBe(true);
    expect(canTransition('partially_failed', 'retry-failed')).toBe(true);
  });

  it('refuses re-entry into a finished mailing and nonsense moves', () => {
    for (const s of TERMINAL_MAILING_STATUSES) {
      for (const a of MAILING_ACTIONS) expect(canTransition(s, a), `${s}:${a}`).toBe(false);
    }
    expect(canTransition('sending', 'send')).toBe(false);
    expect(canTransition('draft', 'resume')).toBe(false);
    expect(canTransition('paused', 'pause')).toBe(false);
    expect(canTransition('partially_failed', 'send')).toBe(false);
    expect(canTransition('draft', 'retry-failed')).toBe(false);
  });
});

describe('mailings', () => {
  it('accepts a mailing with live counts, and the summary without the document', () => {
    expect(Mailing.safeParse(mailing).success).toBe(true);
    expect('document' in MailingSummary.parse(mailing)).toBe(false);
    expect(Mailing.safeParse({ ...mailing, status: 'done' }).success).toBe(false);
    expect(Mailing.safeParse({ ...mailing, counts: { ...mailing.counts, sent: -1 } }).success).toBe(false);
  });

  const base = { subject: 'Hello', topic: 'programme-updates', provider_id: 'prv_1' };

  it('create takes exactly one of document or template_id', () => {
    expect(MailingCreate.safeParse({ ...base, document: doc }).success).toBe(true);
    expect(MailingCreate.safeParse({ ...base, template_id: 'tpl_1' }).success).toBe(true);
    expect(MailingCreate.safeParse(base).success).toBe(false);
    expect(MailingCreate.safeParse({ ...base, document: doc, template_id: 'tpl_1' }).success).toBe(false);
  });

  it('create needs a subject, a topic slug and a provider', () => {
    expect(MailingCreate.safeParse({ ...base, subject: '', document: doc }).success).toBe(false);
    expect(MailingCreate.safeParse({ ...base, topic: 'Programme', document: doc }).success).toBe(false);
    const { provider_id: _p, ...noProvider } = base;
    expect(MailingCreate.safeParse({ ...noProvider, document: doc }).success).toBe(false);
  });

  it('metadata holds up to 20 short string values', () => {
    expect(MailingMetadata.safeParse({ sent_by: 'p1', kind: 'broadcast' }).success).toBe(true);
    const many = Object.fromEntries(Array.from({ length: 21 }, (_, i) => [`k${i}`, 'v']));
    expect(MailingMetadata.safeParse(many).success).toBe(false);
    expect(MailingMetadata.safeParse({ n: 1 }).success).toBe(false);
    expect(MailingMetadata.safeParse({ '': 'v' }).success).toBe(false);
    expect(MailingMetadata.safeParse({ k: 'x'.repeat(501) }).success).toBe(false);
  });

  it('update needs a change; a null clears an optional field', () => {
    expect(MailingUpdate.safeParse({}).success).toBe(false);
    expect(MailingUpdate.safeParse({ preheader: null }).success).toBe(true);
    expect(MailingUpdate.safeParse({ document: doc }).success).toBe(true);
    expect(MailingUpdate.safeParse({ subject: null }).success).toBe(false);
  });

  it('send and action bodies are empty; retry-failed may opt into outcome_unknown', () => {
    expect(MailingSendRequest.safeParse({}).success).toBe(true);
    expect(MailingSendRequest.safeParse({ now: true }).success).toBe(false);
    expect(MailingRetryFailedRequest.safeParse({}).success).toBe(true);
    expect(MailingRetryFailedRequest.safeParse({ include_outcome_unknown: true }).success).toBe(true);
    expect(MailingRetryFailedRequest.safeParse({ include_outcome_unknown: 'yes' }).success).toBe(false);
  });

  it('a test send goes to one valid address', () => {
    expect(MailingTestRequest.safeParse({ to: 'me@example.com', merge: { first_name: 'Me' } }).success).toBe(true);
    expect(MailingTestRequest.safeParse({ to: ['a@b.de'] }).success).toBe(false);
    expect(MailingTestRequest.safeParse({}).success).toBe(false);
  });
});

describe('recipients', () => {
  it('an input names a contact by id, external id or email', () => {
    expect(RecipientInput.safeParse({ contact_id: 'ctc_1' }).success).toBe(true);
    expect(RecipientInput.safeParse({ external_id: 'person_1', merge: { first_name: 'Ada' } }).success).toBe(true);
    expect(RecipientInput.safeParse({ email: 'a@b.de' }).success).toBe(true);
    expect(RecipientInput.safeParse({ merge: { first_name: 'Ada' } }).success).toBe(false);
  });

  it('a batch holds 1 to 1000 recipients', () => {
    expect(RecipientBatch.safeParse({ recipients: [{ email: 'a@b.de' }] }).success).toBe(true);
    expect(RecipientBatch.safeParse({ recipients: [] }).success).toBe(false);
    const tooMany = Array.from({ length: MAX_RECIPIENTS_PER_BATCH + 1 }, (_, i) => ({ email: `a${i}@b.de` }));
    expect(RecipientBatch.safeParse({ recipients: tooMany }).success).toBe(false);
  });

  it('the batch result reports added, already present and rejected items', () => {
    expect(
      RecipientBatchResult.safeParse({ added: 2, already_present: 1, rejected: [{ index: 3, reason: 'unknown_contact' }] })
        .success,
    ).toBe(true);
    expect(RecipientBatchResult.safeParse({ added: 2, already_present: 1, rejected: [{ index: 3, reason: 'meh' }] }).success).toBe(
      false,
    );
  });

  const recipient = {
    id: 'rcp_1',
    mailing_id: 'mlg_1',
    contact_id: 'ctc_1',
    email: 'a@b.de',
    merge: {},
    status: 'skipped',
    skip_reason: 'outcome_unknown',
    attempts: 1,
    message_id: null,
    last_error: 'worker restarted mid-send',
    created_at: TS,
    updated_at: TS,
  };

  it('accepts every status and skip reason, outcome_unknown included', () => {
    expect(SKIP_REASONS).toContain('outcome_unknown');
    for (const reason of SKIP_REASONS) expect(Recipient.safeParse({ ...recipient, skip_reason: reason }).success).toBe(true);
    for (const status of ['queued', 'sending', 'sent', 'failed']) {
      expect(Recipient.safeParse({ ...recipient, status, skip_reason: null }).success, status).toBe(true);
    }
    expect(Recipient.safeParse({ ...recipient, status: 'bounced' }).success).toBe(false);
    expect(Recipient.safeParse({ ...recipient, skip_reason: 'bored' }).success).toBe(false);
    expect(RecipientListQuery.safeParse({ status: 'failed', limit: '100' }).success).toBe(true);
  });
});

describe('messages', () => {
  const summary = {
    id: 'msg_1',
    mailing_id: 'mlg_1',
    recipient_id: 'rcp_1',
    contact_id: 'ctc_1',
    to: 'a@b.de',
    subject: 'Hello',
    provider_id: 'prv_1',
    provider_message_id: '<abc@mail>',
    outcome: 'sent',
    error: null,
    is_test: false,
    recipient_count: 1,
    created_at: TS,
  };

  it('the archive entry carries the final html, the list entry does not', () => {
    expect(MessageSummary.safeParse(summary).success).toBe(true);
    expect(Message.safeParse(summary).success).toBe(false);
    expect(Message.safeParse({ ...summary, html: '<html/>' }).success).toBe(true);
  });

  it('rejects an unknown outcome and a zero recipient count', () => {
    expect(MessageSummary.safeParse({ ...summary, outcome: 'queued' }).success).toBe(false);
    expect(MessageSummary.safeParse({ ...summary, recipient_count: 0 }).success).toBe(false);
  });
});
