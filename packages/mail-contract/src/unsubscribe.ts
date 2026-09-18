/**
 * Unsubscribe links and merge fields.
 *
 * The token format is documented here as types only: the service owns the key and
 * is the only party that mints or checks a token. Clients never build a link;
 * they put `{{unsubscribe_url}}` in the document and the worker substitutes it.
 */

/**
 * The claims an unsubscribe token binds together. `mailing_id` is null for a link
 * from a test send or a preference-centre email; `topic_id` null means the link
 * offers every topic.
 */
export interface UnsubscribeTokenClaims {
  /** Token format version; bumped when the layout below changes. */
  v: 1;
  workspace_id: string;
  contact_id: string;
  mailing_id: string | null;
  topic_id: string | null;
  /** Unix seconds at issue. Tokens do not expire: an old email must still work. */
  iat: number;
}

/**
 * Wire layout: `base64url(JSON(claims)) + "." + base64url(HMAC-SHA256(key,
 * base64url(JSON(claims))))`, keyed with the service's unsubscribe key (versioned
 * so it can rotate; a token signed under a retired key version is still honoured
 * for as long as that version is kept). The token is carried in the path of the
 * hosted page.
 */
export type UnsubscribeToken = string & { readonly __brand: 'UnsubscribeToken' };

/** The hosted page: GET shows the topics, POST applies (link scanners only GET). */
export const UNSUBSCRIBE_PATH_PREFIX = '/u/';

/** RFC 8058 one-click unsubscribe: the body a mail client POSTs to the link. */
export const LIST_UNSUBSCRIBE_POST_VALUE = 'List-Unsubscribe=One-Click';

// Merge fields

/**
 * Merge fields the service fills itself, or treats specially. Every other
 * `{{name}}` in a document is filled from the recipient's `merge` values, then
 * the contact's properties, HTML-escaped. A fallback is written
 * `{{first_name|there}}`.
 */
export const RESERVED_MERGE_FIELDS = {
  /** From the recipient's merge values, else the contact. Supports a fallback. */
  first_name: { source: 'contact', fallback: true, required_for_broadcast: false },
  last_name: { source: 'contact', fallback: true, required_for_broadcast: false },
  email: { source: 'contact', fallback: false, required_for_broadcast: false },
  /** The hosted unsubscribe page for this recipient. A broadcast without it is refused. */
  unsubscribe_url: { source: 'service', fallback: false, required_for_broadcast: true },
} as const;
export type ReservedMergeField = keyof typeof RESERVED_MERGE_FIELDS;

export const MERGE_FIELD_PATTERN = /\{\{\s*([a-z][a-z0-9_]*)\s*(?:\|([^}]*))?\}\}/g;

export interface MergeFieldUse {
  name: string;
  fallback: string | null;
}

/** Lists the merge fields a compiled document uses, in order of appearance. */
export function findMergeFields(html: string): MergeFieldUse[] {
  const uses: MergeFieldUse[] = [];
  for (const match of html.matchAll(MERGE_FIELD_PATTERN)) {
    uses.push({ name: match[1]!, fallback: match[2] === undefined ? null : match[2].trim() });
  }
  return uses;
}

/** The fields a broadcast needs and does not contain. Empty means sendable. */
export function missingRequiredMergeFields(html: string): ReservedMergeField[] {
  const used = new Set(findMergeFields(html).map((u) => u.name));
  return (Object.keys(RESERVED_MERGE_FIELDS) as ReservedMergeField[]).filter(
    (name) => RESERVED_MERGE_FIELDS[name].required_for_broadcast && !used.has(name),
  );
}
