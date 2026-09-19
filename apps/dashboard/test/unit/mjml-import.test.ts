import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_MJML_IMPORT_BYTES, MailApiError } from '@marlinjai/mail-sdk';
import {
  EMPTY_DRAFT,
  clearDraft,
  editSource,
  fingerprint,
  loadDraft,
  nameFromFile,
  refusalPosition,
  requestFingerprint,
  saveDraft,
  sourceSize,
  withKey,
  type ImportDraft,
} from '@/lib/mjml-import';

/*
 * The MJML import flow on the four paths of the stateful-flow standard, at
 * the level of its state (the Playwright suite drives the same paths in the
 * browser), plus the server actions with the SDK mocked.
 */

class MemoryStorage {
  data = new Map<string, string>();
  getItem(k: string) {
    return this.data.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.data.set(k, v);
  }
  removeItem(k: string) {
    this.data.delete(k);
  }
}

let counter = 0;
const mint = () => `key-${++counter}`;
const MJML = '<mjml><mj-body></mj-body></mjml>';
const draft = (over: Partial<ImportDraft> = {}): ImportDraft => ({ ...EMPTY_DRAFT, name: 'Autumn', mjml: MJML, ...over });

describe('forward', () => {
  it('a request gets one key, and keeps it while nothing changes (a retry reuses it)', () => {
    const first = withKey(draft({ step: 'preview' }), mint);
    expect(first.key?.value).toMatch(/^key-/);
    expect(withKey(first, mint)).toBe(first);
  });
});

describe('backtrack and revise', () => {
  it('editing the MJML goes back to the source step and drops the key', () => {
    const keyed = withKey(draft({ step: 'preview' }), mint);
    const edited = editSource(keyed, `${MJML} `);
    expect(edited).toMatchObject({ step: 'source', key: null, mjml: `${MJML} ` });
  });

  it('the same MJML again changes nothing (no new preview, same key)', () => {
    const keyed = withKey(draft({ step: 'preview' }), mint);
    expect(editSource(keyed, MJML)).toBe(keyed);
  });

  it('a different name or image choice is a different request: a new key, never a replay', () => {
    const keyed = withKey(draft(), mint);
    const renamed = withKey({ ...keyed, name: 'Winter' }, mint);
    expect(renamed.key?.value).not.toBe(keyed.key?.value);
    const flipped = withKey({ ...keyed, importRemoteAssets: true }, mint);
    expect(flipped.key?.value).not.toBe(keyed.key?.value);
    // Surrounding spaces in the name are not a different request (the action trims them).
    expect(withKey({ ...keyed, name: ' Autumn ' }, mint).key?.value).toBe(keyed.key?.value);
  });

  it('the preview is keyed to its source: a fingerprint differs as soon as one character does', () => {
    expect(fingerprint(MJML)).toBe(fingerprint(MJML));
    expect(fingerprint(MJML)).not.toBe(fingerprint(MJML.replace('body', 'bodY')));
  });
});

describe('resume', () => {
  it('a reload finds the draft, its step and its key', () => {
    const s = new MemoryStorage();
    const keyed = withKey(draft({ step: 'preview', importRemoteAssets: true }), mint);
    saveDraft(s, 'ws1', keyed);
    expect(loadDraft(s, 'ws1')).toEqual(keyed);
    expect(loadDraft(s, 'ws2')).toEqual(EMPTY_DRAFT);
  });

  it('a stored key that no longer matches its request is discarded on load', () => {
    const s = new MemoryStorage();
    const keyed = withKey(draft(), mint);
    s.setItem('mjml-import:ws1', JSON.stringify({ ...keyed, name: 'Changed elsewhere' }));
    expect(loadDraft(s, 'ws1').key).toBeNull();
  });

  it('broken, foreign or legacy data loads as a fresh draft; a preview step without MJML is the source step', () => {
    const s = new MemoryStorage();
    s.setItem('mjml-import:a', '{not json');
    s.setItem('mjml-import:b', JSON.stringify({ name: 3 }));
    s.setItem('mjml-import:c', JSON.stringify({ name: 'x', mjml: '', step: 'preview' }));
    expect(loadDraft(s, 'a')).toEqual(EMPTY_DRAFT);
    expect(loadDraft(s, 'b')).toEqual(EMPTY_DRAFT);
    expect(loadDraft(s, 'c').step).toBe('source');
  });

  it('a storage that throws (private mode) never breaks the flow', () => {
    const throwing = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
      removeItem: () => {
        throw new Error('denied');
      },
    };
    expect(loadDraft(throwing, 'ws')).toEqual(EMPTY_DRAFT);
    expect(() => saveDraft(throwing, 'ws', draft())).not.toThrow();
    expect(() => clearDraft(throwing, 'ws')).not.toThrow();
    expect(loadDraft(null, 'ws')).toEqual(EMPTY_DRAFT);
  });
});

describe('re-entry', () => {
  it('after a create the draft is gone: the same file again is a new request with a new key', () => {
    const s = new MemoryStorage();
    const first = withKey(draft({ step: 'preview' }), mint);
    saveDraft(s, 'ws', first);
    clearDraft(s, 'ws');
    const again = withKey({ ...loadDraft(s, 'ws'), name: 'Autumn', mjml: MJML, step: 'preview' }, mint);
    expect(requestFingerprint(again)).toBe(requestFingerprint(first));
    expect(again.key?.value).not.toBe(first.key?.value);
  });

  it('an empty draft is not stored at all', () => {
    const s = new MemoryStorage();
    saveDraft(s, 'ws', draft());
    saveDraft(s, 'ws', EMPTY_DRAFT);
    expect(s.data.size).toBe(0);
  });
});

describe('helpers', () => {
  it('sizes in UTF-8 bytes against the service limit', () => {
    expect(sourceSize('ä').bytes).toBe(2);
    expect(sourceSize('x'.repeat(MAX_MJML_IMPORT_BYTES)).tooLarge).toBe(false);
    expect(sourceSize('x'.repeat(MAX_MJML_IMPORT_BYTES + 1)).tooLarge).toBe(true);
  });

  it('names a template after its file', () => {
    expect(nameFromFile('autumn-letter_2026.mjml')).toBe('autumn letter 2026');
  });

  it('reads the position of a refusal', () => {
    expect(refusalPosition({ reason: 'invalid_xml', line: 3, column: 5 })).toEqual({ line: 3, column: 5 });
    expect(refusalPosition({ reason: 'not_mjml' })).toBeNull();
  });
});

const api = { templates: { importPreview: vi.fn(), import: vi.fn() } };
vi.mock('@/lib/mail', () => ({ mail: vi.fn(async () => ({ api })) }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
const { previewImport, importTemplate } = await import('@/app/w/[ws]/templates/actions');

describe('server actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('previews, and refuses empty or oversized MJML without calling the service', async () => {
    api.templates.importPreview.mockResolvedValue({ document: {}, warnings: [] });
    expect((await previewImport('ws', MJML)).ok).toBe(true);
    expect(api.templates.importPreview).toHaveBeenCalledWith({ mjml: MJML });
    const empty = await previewImport('ws', '  ');
    expect(empty.ok).toBe(false);
    const big = await previewImport('ws', 'x'.repeat(MAX_MJML_IMPORT_BYTES + 1));
    expect(big.ok).toBe(false);
    if (!big.ok) expect(big.error.code).toBe('payload_too_large');
    expect(api.templates.importPreview).toHaveBeenCalledTimes(1);
  });

  it('an invalid_mjml refusal keeps the service message with its line and column', async () => {
    api.templates.importPreview.mockRejectedValue(
      new MailApiError({ code: 'invalid_mjml', status: 422, message: 'Line 3, column 5: </mj-body> does not match <mj-section>.', details: { reason: 'invalid_xml', line: 3, column: 5 } }),
    );
    const r = await previewImport('ws', MJML);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.message).toContain('Line 3, column 5');
      expect(refusalPosition(r.error.details)).toEqual({ line: 3, column: 5 });
    }
  });

  it('imports with the idempotency key of the draft', async () => {
    api.templates.import.mockResolvedValue({ template: { id: 't1' }, warnings: [], imported_assets: [] });
    const r = await importTemplate('ws', { name: ' Autumn ', mjml: MJML, importRemoteAssets: true, idempotencyKey: 'key-9' });
    expect(r.ok).toBe(true);
    expect(api.templates.import).toHaveBeenCalledWith({ name: 'Autumn', mjml: MJML, import_remote_assets: true }, { idempotencyKey: 'key-9' });
    const unnamed = await importTemplate('ws', { name: ' ', mjml: MJML, importRemoteAssets: false, idempotencyKey: 'k' });
    expect(unnamed.ok).toBe(false);
    if (!unnamed.ok) expect(unnamed.error.fields?.name).toBe('Name the template');
  });
});
