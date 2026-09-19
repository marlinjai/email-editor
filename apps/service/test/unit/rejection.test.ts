import { describe, expect, it } from 'vitest';
import { classifyRejection, parseSmtpReply, rejectionAction, rejectionSignature, type RejectionClass } from '../../src/transport/rejection.js';

/** [reply code as nodemailer reports it (null when only the text has it), reply text, expected class] */
const TABLE: Array<[number | null, string, RejectionClass]> = [
  // Hard bounces: the address is dead.
  [550, '550 5.1.1 <nobody@example.com>: Recipient address rejected: User unknown in virtual mailbox table', 'recipient'],
  [550, "550-5.1.1 The email account that you tried to reach does not exist. Please try\n550-5.1.1 double-checking the recipient's email address", 'recipient'],
  [550, '550 5.1.10 RESOLVER.ADR.RecipientNotFound; Recipient not found by SMTP address lookup', 'recipient'],
  [550, '550 5.1.2 Host unknown (Name server: example.invalid: host not found)', 'unknown'],
  [550, '550 5.1.2 The recipient mailbox does not exist on this domain', 'recipient'],
  [553, '553 5.1.3 Invalid address syntax', 'recipient'],
  [551, '551 5.1.6 User has moved; please try <new@example.com>', 'recipient'],
  [550, '550 5.2.1 The email account that you tried to reach is disabled.', 'recipient'],
  [null, 'every recipient was rejected: 550 5.1.1 <gone@example.com>: user unknown', 'recipient'],
  [550, '550 #5.1.0 Address rejected.', 'unknown'],
  // 5.1.2 is usually DNS, and 5.1.0 says nothing specific: only a specific recipient phrase counts.
  [550, '550 5.1.2 <x@example.invalid>: Recipient address rejected: Domain not found', 'unknown'],
  [550, '550 5.1.0 Recipient address rejected: Mailbox unavailable', 'unknown'],
  [550, '550 5.1.0 <gone@example.com>: Recipient address rejected: User unknown', 'recipient'],
  // Classic replies without an enhanced code: only when the text names the recipient.
  [550, '550 No such user here', 'recipient'],
  [553, '553 sorry, that domain isn\'t in my list of allowed rcpthosts; no such mailbox', 'recipient'],
  [551, '551 User not local; unknown user', 'recipient'],
  [null, 'every recipient was rejected: 550 Unknown recipient', 'recipient'],

  // The sender's problem: never suppress the recipient.
  [550, '550 5.7.1 Service unavailable, Client host [1.2.3.4] blocked using Spamhaus', 'sender'],
  [554, '554 5.7.1 <x@example.com>: Relay access denied', 'sender'],
  [550, '550 5.7.1 Recipient address rejected: Access denied', 'sender'],
  [550, '550-5.7.26 This mail is unauthenticated, which poses a security risk to the sender and Gmail users', 'sender'],
  [535, '535 5.7.8 Error: authentication failed', 'sender'],
  [535, '535 Authentication credentials invalid', 'sender'],
  [530, '530 5.7.0 Must issue a STARTTLS command first', 'sender'],
  [550, '550 5.7.606 Access denied, banned sending IP', 'sender'],
  [554, '554 5.7.9 Message not accepted for policy reasons', 'sender'],
  [550, '550 5.1.7 Invalid sender address', 'sender'],
  [553, '553 5.1.8 Domain of sender address does not exist', 'sender'],
  // A 5.1.x whose text names the sender or the setup is the sender's problem.
  [550, '550 5.1.0 <me@example.com>: Sender address rejected: not owned by user me@example.com', 'sender'],
  [553, '553 5.1.0 Sender rejected: from address not verified', 'sender'],
  [550, '550 5.1.1 The from address is not one of your addresses', 'sender'],
  [553, '553 5.1.1 <x@example.com>: Relay access denied', 'sender'],
  [554, '554 5.1.1 <x@example.com>: Relay access denied', 'sender'],
  // Postfix's "relay recipient table" lists known mailboxes: a mailbox phrase wins over "relay".
  [550, '550 5.1.1 <gone@example.com>: Recipient address rejected: User unknown in relay recipient table', 'recipient'],
  [550, '550 5.1.1 <gone@example.com>: no such user here (relay host mx2)', 'recipient'],
  [550, '550 5.1.1 Mailbox unavailable', 'recipient'],
  [550, '550 5.1.1 Authentication required for this sender', 'sender'],
  [550, '550 5.2.1 Sender mailbox disabled', 'sender'],
  [550, '550 Message rejected as spam by Content Filtering', 'sender'],
  [550, '550 Recipient rejected: your IP is on a blocklist', 'sender'],
  [554, '554 Sending rate limit exceeded', 'sender'],

  // Neither: failed, nothing else changes.
  [552, '552 5.2.2 The email account that you tried to reach is over quota', 'unknown'],
  [552, '552 5.3.4 Message size exceeds fixed maximum message size', 'unknown'],
  [554, '554 5.4.4 Unable to route', 'unknown'],
  [550, '550 Requested action not taken', 'unknown'],
  // RFC 5321's stock text for any 550: it does not name the cause.
  [550, '550 Requested action not taken: mailbox unavailable', 'unknown'],
  [550, '550 Mailbox unavailable', 'unknown'],
  [554, '554 Transaction failed', 'unknown'],
  [554, '554 No such user here', 'unknown'],
  [550, '550 4.2.0 Try again later', 'unknown'],
  [null, 'simulated permanent rejection', 'unknown'],
  [null, 'no credential is stored for this provider', 'unknown'],
];

describe('classifyRejection', () => {
  it.each(TABLE)('%s %j is %s', (code, text, expected) => {
    expect(classifyRejection(code, text)).toBe(expected);
  });
});

describe('parseSmtpReply', () => {
  it('reads the reply code from the text when nodemailer gave none', () => {
    expect(parseSmtpReply(null, 'every recipient was rejected: 550 5.1.1 gone')).toEqual({
      code: 550,
      enhanced: { cls: 5, subject: 1, detail: 1 },
    });
  });

  it('prefers the code nodemailer reports', () => {
    expect(parseSmtpReply(553, '550 5.1.1 x').code).toBe(553);
  });

  it('reads a multi-line reply', () => {
    expect(parseSmtpReply(550, '550-5.1.1 The email account\n550-5.1.1 more').enhanced).toEqual({ cls: 5, subject: 1, detail: 1 });
  });

  it('does not mistake a version number or an address for a status code', () => {
    expect(parseSmtpReply(null, 'Postfix 3.5.1 says hello to user5.1.1@example.com').enhanced).toBeNull();
  });

  it('finds nothing in text without codes', () => {
    expect(parseSmtpReply(null, 'the connection broke')).toEqual({ code: null, enhanced: null });
  });
});

describe('rejectionAction', () => {
  const cases: Array<[kind: 'smtp' | 'resend', code: number | null, message: string, handedOver: boolean, expected: string]> = [
    ['smtp', 550, '550 5.1.1 user unknown', true, 'suppress'],
    ['smtp', 550, '550 5.7.1 relay denied', true, 'count'],
    ['smtp', 552, '552 5.2.2 mailbox full', true, 'none'],
    ['smtp', null, 'no credential is stored for this provider', false, 'count'],
    ['resend', 403, '403 validation_error: The example.com domain is not verified', true, 'count'],
    ['resend', 401, '401 invalid_api_key: API key is invalid', true, 'count'],
    // An HTTP 422 is not an SMTP 5.1.1, whatever its text says.
    ['resend', 422, '422 validation_error: Invalid `to` field. 550 5.1.1', true, 'none'],
    ['resend', 550, '550 5.1.1 user unknown', true, 'none'],
  ];
  it.each(cases)('%s %s %j (handed over %s) is %s', (kind, code, message, handedOver, expected) => {
    expect(rejectionAction(kind, { code, message }, handedOver)).toBe(expected);
  });
});

describe('rejectionSignature', () => {
  it('is the same for the same cause at different addresses', () => {
    const a = rejectionSignature('550 5.1.1 <ada@example.com>: Recipient address rejected: User unknown in virtual mailbox table');
    const b = rejectionSignature('550 5.1.1 <BOB@example.org>: Recipient address rejected: User unknown in virtual mailbox table');
    expect(a).toBe(b);
    expect(a).not.toContain('@');
  });

  it('strips bare addresses and queue ids, keeps the codes', () => {
    expect(rejectionSignature('550 5.1.1 cyd@example.com does not exist (queue 4F2A9C01BE)')).toBe('550 5.1.1 does not exist (queue )');
  });

  it('differs for different causes', () => {
    expect(rejectionSignature('550 5.1.1 user unknown')).not.toBe(rejectionSignature('550 5.1.1 mailbox disabled'));
  });
});
