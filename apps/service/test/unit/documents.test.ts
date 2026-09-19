import { describe, expect, it } from 'vitest';
import { validateDocument } from '../../src/documents.js';
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
