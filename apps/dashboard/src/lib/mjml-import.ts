import { MAX_MJML_IMPORT_BYTES } from '@marlinjai/mail-contract';

/**
 * The MJML import flow's state, kept apart from the screen so its four paths
 * (the stateful-flow standard) are unit-tested:
 *
 * - forward: paste or upload, preview, create;
 * - backtrack: changing the MJML after a preview discards that preview and its
 *   warnings (the preview is keyed to the source it was made from); going back
 *   and keeping the same MJML keeps it;
 * - resume: the draft (name, source, step, idempotency key) is kept in the
 *   tab's sessionStorage, so a reload on the preview step previews again and
 *   lands where it was. The preview itself is never stored: a stored preview
 *   whose key no longer matches would be stale by definition;
 * - re-entry: after a create the draft is cleared, so importing the same file
 *   again is a new request (a second template). A retry of the same create
 *   (a double click, a network retry) reuses the idempotency key, and the
 *   service answers with the first template instead of making another.
 *
 * Plain functions over plain data: safe in a client component.
 */

export type ImportStep = 'source' | 'preview';

export type ImportDraft = {
  name: string;
  mjml: string;
  step: ImportStep;
  importRemoteAssets: boolean;
  /**
   * The Idempotency-Key for creating the template, and the request it was
   * minted for. A different request (another name, other MJML, the image
   * choice flipped) gets a new key, never a replay of an old answer.
   */
  key: { value: string; request: string } | null;
};

export const EMPTY_DRAFT: ImportDraft = { name: '', mjml: '', step: 'source', importRemoteAssets: false, key: null };

/** A short, stable fingerprint of a string (FNV-1a, 32 bits, twice): keys state to its source, not a security measure. */
export function fingerprint(text: string): string {
  let a = 0x811c9dc5;
  let b = 0x01000193 ^ text.length;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193) >>> 0;
    b = Math.imul(b ^ c, 0x5bd1e995) >>> 0;
  }
  return `${a.toString(16).padStart(8, '0')}${b.toString(16).padStart(8, '0')}`;
}

/** What identifies a create request: the fields the service sees. */
export function requestFingerprint(d: Pick<ImportDraft, 'name' | 'mjml' | 'importRemoteAssets'>): string {
  return fingerprint(JSON.stringify([d.name.trim(), d.mjml, d.importRemoteAssets]));
}

/** The draft with an idempotency key for its current request: the stored one while the request is unchanged, a new one otherwise. */
export function withKey(draft: ImportDraft, mint: () => string): ImportDraft {
  const request = requestFingerprint(draft);
  if (draft.key && draft.key.request === request) return draft;
  return { ...draft, key: { value: mint(), request } };
}

/** The MJML changed: back to the source step, with nothing derived from the old source kept. */
export function editSource(draft: ImportDraft, mjml: string): ImportDraft {
  if (mjml === draft.mjml) return draft;
  return { ...draft, mjml, step: 'source', key: null };
}

/** The size of a source in UTF-8 bytes, and whether it is over the service's limit. */
export function sourceSize(mjml: string): { bytes: number; tooLarge: boolean } {
  const bytes = new TextEncoder().encode(mjml).length;
  return { bytes, tooLarge: bytes > MAX_MJML_IMPORT_BYTES };
}

/** A name for the template from an uploaded file's name (`autumn-letter.mjml` becomes `autumn letter`). */
export function nameFromFile(filename: string): string {
  return filename
    .replace(/\.[^.]+$/, '')
    .replace(/[-_]+/g, ' ')
    .trim()
    .slice(0, 200);
}

const storageKey = (ws: string) => `mjml-import:${ws}`;

/** The stored draft of a workspace, or the empty one. Unreadable or foreign data is discarded, never trusted. */
export function loadDraft(storage: Pick<Storage, 'getItem'> | null, ws: string): ImportDraft {
  try {
    const raw = storage?.getItem(storageKey(ws));
    if (!raw) return EMPTY_DRAFT;
    const v = JSON.parse(raw) as Partial<ImportDraft>;
    if (typeof v.name !== 'string' || typeof v.mjml !== 'string') return EMPTY_DRAFT;
    const step: ImportStep = v.step === 'preview' && v.mjml.length > 0 ? 'preview' : 'source';
    const key =
      v.key && typeof v.key.value === 'string' && typeof v.key.request === 'string' && v.key.request === requestFingerprint({ name: v.name, mjml: v.mjml, importRemoteAssets: v.importRemoteAssets === true })
        ? v.key
        : null;
    return { name: v.name, mjml: v.mjml, step, importRemoteAssets: v.importRemoteAssets === true, key };
  } catch {
    return EMPTY_DRAFT;
  }
}

/** Stores the draft; a storage that refuses (private mode, full) only loses the resume path, never the flow. */
export function saveDraft(storage: Pick<Storage, 'setItem' | 'removeItem'> | null, ws: string, draft: ImportDraft): void {
  try {
    if (!storage) return;
    if (draft.name === '' && draft.mjml === '') storage.removeItem(storageKey(ws));
    else storage.setItem(storageKey(ws), JSON.stringify(draft));
  } catch {
    // Nothing to do: the flow works without resume.
  }
}

export function clearDraft(storage: Pick<Storage, 'removeItem'> | null, ws: string): void {
  try {
    storage?.removeItem(storageKey(ws));
  } catch {
    // As above.
  }
}

/** A line of an `invalid_mjml` refusal's details, for the message under the source. */
export function refusalPosition(details: Record<string, unknown> | undefined): { line: number; column: number | null } | null {
  const line = details?.line;
  const column = details?.column;
  if (typeof line !== 'number') return null;
  return { line, column: typeof column === 'number' ? column : null };
}
