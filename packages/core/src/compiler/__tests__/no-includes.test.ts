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
});
