import { describe, it, expect } from 'vitest';
import { MJMLCompiler } from '../MJMLCompiler';
import { BlockType } from '../../store/mst/models/BlockModel';
import type { EmailTemplate } from '../../schema/types';

const compiler = new MJMLCompiler();

function makeTemplate(rightSubColumns: any[]): EmailTemplate {
  return {
    id: 't1',
    metadata: { title: 'sc-test' },
    sections: [
      {
        id: 'sec1',
        type: 'section',
        columns: [
          { id: 'col1', width: 50, blocks: [{ id: 'i1', type: BlockType.IMAGE, src: 'https://x/h.png' }] },
          { id: 'col2', width: 50, blocks: [], subColumns: rightSubColumns },
        ],
      },
    ],
  } as any;
}

describe('MJMLCompiler sub-columns', () => {
  it('emits <mj-raw> nested table for a group column', () => {
    const tpl = makeTemplate([
      { id: 'sc1', width: 50, blocks: [{ id: 't1', type: BlockType.TEXT, content: '<p>A</p>' }] },
      { id: 'sc2', width: 50, blocks: [{ id: 't2', type: BlockType.TEXT, content: '<p>B</p>' }] },
    ]);
    const r = compiler.compile(tpl);
    expect(r.errors).toBeUndefined();
    expect(r.mjml).toContain('<mj-raw>');
    expect(r.mjml).toContain('class="ee-sub-cols"');
    expect(r.mjml).toContain('class="ee-sub-col"');
    expect(r.mjml).toContain('<p>A</p>');
    expect(r.mjml).toContain('<p>B</p>');
  });

  it('emits the responsive media query once per template (mj-style)', () => {
    const tpl = makeTemplate([
      { id: 'sc1', width: 50, blocks: [] },
      { id: 'sc2', width: 50, blocks: [] },
    ]);
    const r = compiler.compile(tpl);
    // Count <mj-style> blocks that mention the sub-col selector. Should be exactly one,
    // even if multiple columns in the template use sub-columns.
    const styleBlocks = (r.mjml.match(/<mj-style>[^<]*ee-sub-col[\s\S]*?<\/mj-style>/g) ?? []).length;
    expect(styleBlocks).toBe(1);
  });

  it('does not emit the media query when no column has sub-columns', () => {
    const tpl = {
      id: 't1', metadata: {},
      sections: [{
        id: 'sec1', type: 'section', columns: [
          { id: 'c1', width: 100, blocks: [] },
        ],
      }],
    } as any;
    const r = compiler.compile(tpl);
    expect(r.mjml).not.toContain('ee-sub-col');
  });

  it('renders compiled HTML containing the nested table', () => {
    const tpl = makeTemplate([
      { id: 'sc1', width: 50, blocks: [{ id: 'b1', type: BlockType.BUTTON, label: 'Go', href: 'https://x' }] },
      { id: 'sc2', width: 50, blocks: [] },
    ]);
    const r = compiler.compile(tpl);
    expect(r.errors).toBeUndefined();
    expect(r.html).toContain('ee-sub-cols');
    expect(r.html).toContain('>Go</a>');
  });

  it('clamps sub-column widths if they do not sum to 100', () => {
    const tpl = makeTemplate([
      { id: 'sc1', width: 60, blocks: [] },
      { id: 'sc2', width: 60, blocks: [] }, // 60+60=120
    ]);
    const r = compiler.compile(tpl);
    const widths = [...r.mjml.matchAll(/td class="ee-sub-col" width="(\d+(?:\.\d+)?)%"/g)].map(m => parseFloat(m[1]));
    const sum = widths.reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(100, 1);
  });
});
