import { MAX_RECIPIENTS_PER_BATCH } from '@marlinjai/mail-contract';

/**
 * Turns pasted text or a CSV file into recipients (email plus first name),
 * before anything is sent to the service.
 *
 * Accepted shapes, one recipient per line:
 *   - a bare address: `ana@example.com`
 *   - address and first name, separated by a comma, semicolon or tab, in
 *     either order: `ana@example.com, Ana` or `Ana;ana@example.com`
 *   - a CSV with a header row naming the columns (`email`, and `first_name`,
 *     `firstname`, `first name` or `vorname`); other columns are ignored
 *   - quoted CSV fields (`"Doe, Ana"`), as spreadsheets export them
 *
 * Problems are reported per line rather than dropped silently: an invalid
 * address, a line without one, and a repeat of an address already in the
 * list. Addresses are compared case-insensitively, as the service does.
 */

export type ParsedRecipient = { email: string; firstName: string | null };
export type ParseProblem = { line: number; text: string; reason: 'invalid_email' | 'no_email' | 'duplicate' };
export type ParseResult = { recipients: ParsedRecipient[]; problems: ParseProblem[]; overLimit: boolean };

// Deliberately close to the contract's zod `.email()`: local@domain.tld, no spaces.
const EMAIL = /^[^\s@"<>(),;:]+@[^\s@"<>(),;:]+\.[^\s@"<>(),;:]{2,}$/;
const EMAIL_HEADERS = new Set(['email', 'e-mail', 'mail', 'email address', 'e-mail-adresse', 'emailadresse']);
const NAME_HEADERS = new Set(['first_name', 'firstname', 'first name', 'given name', 'vorname', 'name']);

function splitLine(line: string): string[] {
  const delimiter = line.includes('\t') ? '\t' : line.includes(';') && !line.includes(',') ? ';' : ',';
  const out: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delimiter) {
      out.push(field);
      field = '';
    } else field += ch;
  }
  out.push(field);
  return out.map((f) => f.trim());
}

/** `Ana Doe <ana@example.com>` → the address inside the brackets. */
function unwrap(value: string): string {
  const m = /<([^>]+)>/.exec(value);
  return (m ? m[1]! : value).trim();
}

export function isEmail(value: string): boolean {
  return value.length >= 3 && value.length <= 254 && EMAIL.test(value);
}

export function parseRecipients(text: string, limit = MAX_RECIPIENTS_PER_BATCH): ParseResult {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/);
  const recipients: ParsedRecipient[] = [];
  const problems: ParseProblem[] = [];
  const seen = new Set<string>();
  let emailCol: number | null = null;
  let nameCol: number | null = null;
  let headerChecked = false;

  lines.forEach((raw, index) => {
    const line = raw.trim();
    if (line === '' || line.startsWith('#')) return;
    const fields = splitLine(line);

    if (!headerChecked) {
      headerChecked = true;
      const lower = fields.map((f) => f.toLowerCase());
      const e = lower.findIndex((f) => EMAIL_HEADERS.has(f));
      if (e !== -1) {
        emailCol = e;
        const n = lower.findIndex((f, i) => i !== e && NAME_HEADERS.has(f));
        nameCol = n === -1 ? null : n;
        return;
      }
    }

    let email: string | null = null;
    let firstName: string | null = null;
    if (emailCol !== null) {
      email = fields[emailCol] !== undefined ? unwrap(fields[emailCol]!) : null;
      firstName = nameCol !== null ? (fields[nameCol] ?? null) : null;
    } else {
      const at = fields.findIndex((f) => f.includes('@'));
      if (at !== -1) {
        email = unwrap(fields[at]!);
        firstName = fields.find((f, i) => i !== at && f !== '') ?? null;
      }
    }

    if (!email) {
      problems.push({ line: index + 1, text: line, reason: 'no_email' });
      return;
    }
    const normalised = email.toLowerCase();
    if (!isEmail(normalised)) {
      problems.push({ line: index + 1, text: line, reason: 'invalid_email' });
      return;
    }
    if (seen.has(normalised)) {
      problems.push({ line: index + 1, text: line, reason: 'duplicate' });
      return;
    }
    seen.add(normalised);
    const name = firstName?.trim() ?? '';
    recipients.push({ email: normalised, firstName: name === '' ? null : name.slice(0, 200) });
  });

  return { recipients: recipients.slice(0, limit), problems, overLimit: recipients.length > limit };
}

export const PROBLEM_LABELS: Record<ParseProblem['reason'], string> = {
  invalid_email: 'not a valid address',
  no_email: 'no address on this line',
  duplicate: 'already listed above',
};
