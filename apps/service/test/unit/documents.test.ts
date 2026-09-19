import { describe, expect, it } from 'vitest';
import { acceptDocument, schemaVersionOf, validateDocument } from '../../src/documents.js';
import { ApiError } from '../../src/api-error.js';

const doc = (html: string) => ({
  version: '1.0',
  metadata: { title: 'x' },
  sections: [{ id: 's1', type: 'section', columns: [{ id: 'c1', blocks: [{ id: 'r1', type: 'raw', html }] }] }],
});

describe('validateDocument refuses mj-include', () => {
  it.each([
    '<mj-include path="/etc/hosts" type="html" />',
    '</mj-raw><mj-include path="/proc/self/environ" /><mj-raw>',
    '< MJ-INCLUDE path="x">',
  ])('refuses %s', (html) => {
    let thrown: unknown;
    try {
      validateDocument(doc(html));
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(ApiError);
    expect((thrown as ApiError).code).toBe('validation_failed');
  });

  // The MJML import's fields, emitted by the compiler verbatim (head) or as attribute values.
  const include = '<mj-include path="/proc/self/environ" type="html" />';
  const withImport = (metadata: Record<string, unknown>, extra?: Record<string, string>) => ({
    version: '1.0',
    metadata: { title: 'x', ...metadata },
    sections: [
      {
        id: 's1',
        type: 'section',
        ...(extra ? { extraAttributes: extra } : {}),
        columns: [{ id: 'c1', blocks: [{ id: 't1', type: 'text', content: 'x', ...(extra ? { extraAttributes: extra } : {}) }] }],
      },
    ],
  });

  it.each([
    ['metadata.mjmlHead.headRaw', withImport({ mjmlHead: { headRaw: include } })],
    ['metadata.mjmlHead.attributes', withImport({ mjmlHead: { attributes: `</mj-attributes>${include}<mj-attributes>` } })],
    ['metadata.mjmlHead.bodyAttributes values', withImport({ mjmlHead: { bodyAttributes: { 'background-color': `x">${include}` } } })],
    ['extraAttributes values', withImport({}, { 'font-weight': `"/>${include}` })],
    ['a body-level raw section', { ...doc(include), sections: [{ ...doc(include).sections[0], bodyRaw: true }] }],
  ])('refuses an include smuggled through %s', (_where, document) => {
    let thrown: unknown;
    try {
      validateDocument(document);
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(ApiError);
    expect((thrown as ApiError).code).toBe('validation_failed');
  });

  it('accepts a raw block without includes', () => {
    expect(() => validateDocument(doc('<div>plain</div>'))).not.toThrow();
  });
});

describe('schema versions: stored as sent, compiled at the current version', () => {
  const legacyWrapper = {
    version: '1.0',
    metadata: { title: 'x' },
    sections: [{ id: 'w', type: 'section', isWrapper: true, backgroundColor: '#eee', columns: [{ id: 'c', blocks: [] }] }],
  };

  it('acceptDocument keeps a 1.0 document exactly as sent (an older editor reads back what it saved)', () => {
    const sent = structuredClone(legacyWrapper);
    const stored = acceptDocument(sent);
    expect(stored).toBe(sent);
    expect(schemaVersionOf(stored)).toBe('1.0');
  });

  it('validateDocument hands the compiler the current version, the 1.0 wrapper flag as a wrapper', () => {
    const current = validateDocument(structuredClone(legacyWrapper));
    expect(current.version).toBe('1.1');
    expect(current.sections[0]).toMatchObject({ id: 'w', type: 'wrapper', backgroundColor: '#eee' });
  });

  it('accepts a 1.1 document with a wrapper, and refuses a wrapper in a 1.0 document (NEWER shape, old version)', () => {
    const wrapped = { version: '1.1', metadata: {}, sections: [{ id: 'w', type: 'wrapper', sections: [{ id: 's', type: 'section', columns: [{ id: 'c', blocks: [] }] }] }] };
    expect(acceptDocument(wrapped)).toBe(wrapped);
    let thrown: unknown;
    try {
      acceptDocument({ ...wrapped, version: '1.0' });
    } catch (err) {
      thrown = err;
    }
    expect((thrown as ApiError).code).toBe('validation_failed');
    expect((thrown as ApiError).details).toMatchObject({ reason: 'INVALID_DOCUMENT' });
  });

  it('refuses a wrapper inside a wrapper, with the path', () => {
    const nested = { version: '1.1', metadata: {}, sections: [{ id: 'w', type: 'wrapper', sections: [{ id: 'x', type: 'wrapper', sections: [] }] }] };
    let thrown: unknown;
    try {
      acceptDocument(nested);
    } catch (err) {
      thrown = err;
    }
    expect((thrown as ApiError).code).toBe('validation_failed');
    const issues = ((thrown as ApiError).details as { issues: { path: unknown[] }[] }).issues;
    expect(issues[0]!.path.slice(0, 4)).toEqual(['document', 'sections', 0, 'sections']);
  });

  it('a schema newer than the service is NEWER_VERSION, so a client knows to wait for the service', () => {
    let thrown: unknown;
    try {
      acceptDocument({ version: '1.2', metadata: {}, sections: [] });
    } catch (err) {
      thrown = err;
    }
    expect((thrown as ApiError).details).toMatchObject({ reason: 'NEWER_VERSION', document_version: '1.2' });
  });
});
