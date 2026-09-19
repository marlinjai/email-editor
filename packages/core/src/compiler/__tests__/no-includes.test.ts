import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { MJMLCompiler } from '../MJMLCompiler';
import type { EmailTemplate } from '../../schema/types';

// A stored document must never make the compiler read a file from the
// server's disk. mjml-core resolves <mj-include path="..."> unless it is told
// not to, and a Raw block's html is emitted into the MJML verbatim.

const dir = mkdtempSync(join(tmpdir(), 'ee-include-'));
const secretFile = join(dir, 'secret.html');
const SECRET = 'SECRET-FILE-CONTENT-7f3a';
writeFileSync(secretFile, `<p>${SECRET}</p>`);

function withRaw(html: string): EmailTemplate {
  return {
    version: '1.0',
    metadata: { title: 'Includes' },
    sections: [
      {
        id: 's1',
        type: 'section',
        columns: [{ id: 'c1', blocks: [{ id: 'r1', type: 'raw', html }] }],
      },
    ],
  } as unknown as EmailTemplate;
}

describe('MJMLCompiler never resolves mj-include', () => {
  const compiler = new MJMLCompiler();

  it('does not read a file named by an include smuggled out of a Raw block', () => {
    const result = compiler.compile(
      withRaw(`</mj-raw><mj-include path="${secretFile}" type="html" /><mj-raw>`),
    );
    expect(result.html ?? '').not.toContain(SECRET);
  });

  it('does not read a file named by an include inside a Raw block', () => {
    const result = compiler.compile(withRaw(`<mj-include path="${secretFile}" type="html" />`));
    expect(result.html ?? '').not.toContain(SECRET);
  });

  // The MJML import's fields: emitted verbatim (head) or as attribute values.
  const include = `<mj-include path="${secretFile}" type="html" />`;
  const withMetadata = (metadata: EmailTemplate['metadata'], extra?: Record<string, string>): EmailTemplate => ({
    version: '1.0',
    metadata: { title: 'Includes', ...metadata },
    sections: [
      {
        id: 's1',
        type: 'section',
        extraAttributes: extra,
        columns: [{ id: 'c1', extraAttributes: extra, blocks: [{ id: 't1', type: 'text', content: 'x', extraAttributes: extra }] }],
      },
    ],
  });

  it.each([
    ['metadata.mjmlHead.headRaw', withMetadata({ mjmlHead: { headRaw: include } })],
    ['metadata.mjmlHead.headRaw, closing the head', withMetadata({ mjmlHead: { headRaw: `</mj-head><mj-body>${include}</mj-body><mj-head>` } })],
    ['metadata.mjmlHead.attributes, closing mj-attributes', withMetadata({ mjmlHead: { attributes: `</mj-attributes>${include}<mj-attributes>` } })],
    ['metadata.mjmlHead.bodyAttributes values', withMetadata({ mjmlHead: { bodyAttributes: { 'background-color': `x">${include}<x y="` } } })],
    ['extraAttributes values on a section, a column and a block', withMetadata({}, { 'css-class': `x">${include}<x y="`, 'font-weight': `"/>${include}` })],
  ])('does not read a file named by an include smuggled through %s', (_where, doc) => {
    const result = compiler.compile(doc);
    expect(result.html ?? '').not.toContain(SECRET);
  });

  it('a body-level raw section: no file content either', () => {
    const doc = withRaw(include);
    doc.sections[0]!.bodyRaw = true;
    expect(compiler.compile(doc).html ?? '').not.toContain(SECRET);
  });

  it('an attribute value cannot leave its attribute', () => {
    const { mjml } = compiler.compile(withMetadata({ mjmlHead: { bodyAttributes: { 'background-color': `x"><mj-include path="y" />` } } }));
    expect(mjml).toContain('background-color="x&quot;><mj-include path=&quot;y&quot; />"');
  });
});
