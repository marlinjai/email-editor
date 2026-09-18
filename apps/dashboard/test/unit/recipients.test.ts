import { describe, expect, it } from 'vitest';
import { parseRecipients } from '@/lib/recipients';

describe('parseRecipients', () => {
  it('reads bare addresses and address-plus-name lines in either order', () => {
    const r = parseRecipients('ana@example.com\nBen@Example.com, Ben\nCara;cara@example.com\n\n# a comment\n');
    expect(r.recipients).toEqual([
      { email: 'ana@example.com', firstName: null },
      { email: 'ben@example.com', firstName: 'Ben' },
      { email: 'cara@example.com', firstName: 'Cara' },
    ]);
    expect(r.problems).toEqual([]);
  });

  it('reads a CSV with a header, any column order, quoted fields and a byte order mark', () => {
    const csv = '﻿id,First Name,Email,city\n1,"Doe, Ana",ana@example.com,Berlin\n2,Ben,ben@example.com,Rome\n';
    expect(parseRecipients(csv).recipients).toEqual([
      { email: 'ana@example.com', firstName: 'Doe, Ana' },
      { email: 'ben@example.com', firstName: 'Ben' },
    ]);
  });

  it('reads tab-separated spreadsheet pastes and "Name <address>" forms', () => {
    const r = parseRecipients('email\tvorname\nana@example.com\tAna\nBen <ben@example.com>');
    expect(r.recipients.map((x) => x.email)).toEqual(['ana@example.com', 'ben@example.com']);
  });

  it('reports invalid, missing and repeated addresses per line instead of dropping them silently', () => {
    const r = parseRecipients('ana@example.com\nnot-an-address\nJust a name, Ben\nANA@example.com');
    expect(r.recipients).toHaveLength(1);
    expect(r.problems).toEqual([
      { line: 2, text: 'not-an-address', reason: 'no_email' },
      { line: 3, text: 'Just a name, Ben', reason: 'no_email' },
      { line: 4, text: 'ANA@example.com', reason: 'duplicate' },
    ]);
    expect(parseRecipients('ana@@example').problems[0]?.reason).toBe('invalid_email');
  });

  it('caps a batch at the contract limit and says so', () => {
    const many = Array.from({ length: 1005 }, (_, i) => `p${i}@example.com`).join('\n');
    const r = parseRecipients(many);
    expect(r.recipients).toHaveLength(1000);
    expect(r.overLimit).toBe(true);
    expect(parseRecipients('a@example.com').overLimit).toBe(false);
  });

  it('treats an empty paste as nothing to add', () => {
    expect(parseRecipients('   \n\n')).toEqual({ recipients: [], problems: [], overLimit: false });
  });
});
