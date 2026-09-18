/** Template documents for the S1 tests, in the editor's schema version 1.0. */

type Block = Record<string, unknown>;

export function documentWith(blocks: Block[], metadata: Record<string, unknown> = {}) {
  return {
    version: '1.0',
    metadata,
    sections: [{ id: 'sec-1', type: 'section', columns: [{ id: 'col-1', blocks }] }],
  };
}

export const textBlock = (content: string, id = 'txt-1'): Block => ({ id, type: 'text', content });

/** Compiles cleanly. */
export const helloDocument = (greeting = 'Hello') => documentWith([textBlock(`<p>${greeting}, world</p>`)], { title: 'Hello' });

/** Valid for the schema, but MJML rejects the spacer's height: compiles with errors. */
export const brokenSpacerDocument = () => documentWith([{ id: 'sp-1', type: 'spacer', height: 'abc' }]);

/**
 * A document of roughly `targetBytes` of JSON made of many one-block sections:
 * MJML's cost grows with the number of elements, so at the size limit this
 * keeps a worker busy for seconds.
 */
export function heavyDocument(targetBytes: number) {
  const sections: unknown[] = [];
  let size = 0;
  for (let i = 0; ; i++) {
    const section = { id: `sec-${i}`, type: 'section', columns: [{ id: `col-${i}`, blocks: [textBlock(`<p>Row ${i}</p>`, `t-${i}`)] }] };
    size += JSON.stringify(section).length + 1;
    if (size >= targetBytes) break;
    sections.push(section);
  }
  return { version: '1.0', metadata: { title: 'Heavy' }, sections };
}
