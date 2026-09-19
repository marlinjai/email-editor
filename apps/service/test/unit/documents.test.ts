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

  it('accepts a raw block without includes', () => {
    expect(() => validateDocument(doc('<div>plain</div>'))).not.toThrow();
  });
});
