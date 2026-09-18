import { LIST_UNSUBSCRIBE_POST_VALUE, MERGE_FIELD_PATTERN, UNSUBSCRIBE_PATH_PREFIX } from '@marlinjai/mail-contract';

/** Where the hosted unsubscribe page lives, unless the app is told otherwise. */
export const DEFAULT_PUBLIC_BASE_URL = 'https://mail.lumitra.co';

/** What one recipient's message is personalised from. */
export type MergeContext = {
  email: string;
  /** The recipient's own merge values from the batch (or the test request); they win. */
  merge: Record<string, unknown>;
  /** The contact behind the recipient, when there is one. */
  contact: {
    first_name: string | null;
    last_name: string | null;
    properties: Record<string, unknown>;
  } | null;
  /** The recipient's hosted unsubscribe page (see `unsubscribeUrl`). */
  unsubscribeUrl: string;
};

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => ESCAPES[ch]!);
}

export function unsubscribeUrl(baseUrl: string, token: string): string {
  return `${baseUrl.replace(/\/+$/, '')}${UNSUBSCRIBE_PATH_PREFIX}${token}`;
}

/** A scalar as text; anything else (an object, a list, null) is no value. */
function text(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'boolean') return String(value);
  return null;
}

/**
 * The value of one merge field, before escaping, following the contract's
 * RESERVED_MERGE_FIELDS: `unsubscribe_url` and `email` come from the service,
 * `first_name` and `last_name` from the recipient's merge values and then the
 * contact, every other name from the merge values and then the contact's
 * properties. An empty value falls back to the field's `{{name|fallback}}`, and
 * without one to nothing, so a raw `{{...}}` never reaches a reader.
 */
function valueOf(name: string, fallback: string | undefined, ctx: MergeContext): string {
  let value: string | null;
  switch (name) {
    case 'unsubscribe_url':
      return ctx.unsubscribeUrl;
    case 'email':
      return ctx.email;
    case 'first_name':
    case 'last_name':
      value = text(ctx.merge[name]) ?? ctx.contact?.[name] ?? null;
      break;
    default:
      value = text(ctx.merge[name]) ?? text(ctx.contact?.properties[name]);
  }
  if (value === null || value.trim() === '') return fallback?.trim() ?? '';
  return value;
}

/** Substitutes every merge field of a compiled HTML body, each value HTML-escaped. */
export function mergeHtml(html: string, ctx: MergeContext): string {
  return html.replace(MERGE_FIELD_PATTERN, (_m, name: string, fallback: string | undefined) =>
    escapeHtml(valueOf(name, fallback, ctx)),
  );
}

// Every C0 control character and DEL: a line break in a header value would start a new header.
const CONTROL = new RegExp('[\\u0000-\\u001f\\u007f]+', 'g');

/**
 * Substitutes the merge fields of a subject line. A header is not HTML, so
 * nothing is escaped; control characters (line breaks above all) become a
 * space, so a merge value can never add a header.
 */
export function mergeSubject(subject: string, ctx: MergeContext): string {
  return subject
    .replace(MERGE_FIELD_PATTERN, (_m, name: string, fallback: string | undefined) => valueOf(name, fallback, ctx))
    .replace(CONTROL, ' ')
    .trim();
}

/**
 * The List-Unsubscribe headers of RFC 2369 and RFC 8058 (one-click): the hosted
 * page over https, which a mail client POSTs `List-Unsubscribe=One-Click` to, and
 * a mailto alternative for clients that only speak that. The mailto goes to the
 * sender's own reply address, the mailbox a person answers.
 */
export function listUnsubscribeHeaders(url: string, mailto: string): Record<string, string> {
  return {
    'List-Unsubscribe': `<${url}>, <mailto:${mailto}?subject=unsubscribe>`,
    'List-Unsubscribe-Post': LIST_UNSUBSCRIBE_POST_VALUE,
  };
}
