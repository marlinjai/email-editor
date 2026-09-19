import { describe, expect, it } from 'vitest';
import { getSnapshot } from 'mobx-state-tree';
import { createRootStore } from '../RootStore';
import { validateTemplate } from '../../../schema/validation';
import { MJMLCompiler } from '../../../compiler/MJMLCompiler';
import type { EmailTemplate } from '../../../schema/types';

const doc: EmailTemplate = {
  version: '1.0',
  metadata: { title: 't', mjmlHead: { attributes: '<mj-all font-family="Arial" />', bodyAttributes: { 'background-color': '#eee' } } },
  sections: [
    {
      id: 's1',
      type: 'section',
      padding: { top: '9px', bottom: '3px' },
      extraAttributes: { 'css-class': 'hero', 'border-radius': '4px' },
      columns: [
        {
          id: 'c1',
          padding: { left: '7px' },
          blocks: [
            { id: 'b1', type: 'text', content: 'x', padding: { top: '5px', right: '1px', bottom: '5px', left: '1px' } },
            { id: 'b2', type: 'button', label: 'Go', href: 'https://x.de', extraAttributes: { 'font-weight': '700' } },
          ],
        },
      ],
    },
  ],
};

describe('the store keeps the schema padding object and imported extras', () => {
  it('opens a document with padding objects and emits them unchanged', () => {
    const store = createRootStore({ template: doc as never });
    const out = getSnapshot(store.template) as unknown as EmailTemplate;
    const section = out.sections[0]!;
    expect(section.padding).toEqual({ top: '9px', bottom: '3px' });
    expect(section.extraAttributes).toEqual({ 'css-class': 'hero', 'border-radius': '4px' });
    expect(section.columns[0]!.padding).toEqual({ left: '7px' });
    expect(section.columns[0]!.blocks[0]).toMatchObject({ padding: { top: '5px', right: '1px', bottom: '5px', left: '1px' } });
    expect(section.columns[0]!.blocks[1]).toMatchObject({ extraAttributes: { 'font-weight': '700' } });
    expect(out.metadata.mjmlHead).toEqual(doc.metadata.mjmlHead);
    expect(JSON.stringify(out)).not.toContain('paddingTop');
    expect(validateTemplate(out).success).toBe(true);
  });

  it('an edit made through the flat fields reaches the snapshot as padding', () => {
    const store = createRootStore({ template: doc as never });
    store.template.sections[0]!.setPadding({ left: '12px' });
    const out = getSnapshot(store.template) as unknown as EmailTemplate;
    expect(out.sections[0]!.padding).toEqual({ top: '9px', bottom: '3px', left: '12px' });
  });

  it('the compiler emits all four sides, the extras and the imported head', () => {
    const { mjml } = new MJMLCompiler().compile(doc);
    expect(mjml).toContain('padding="9px 0 3px 0"');
    expect(mjml).toContain('padding="0 0 0 7px"');
    expect(mjml).toMatch(/<mj-section [^>]*border-radius="4px"[^>]*css-class="el-section el-s1 hero"/);
    expect(mjml).toMatch(/<mj-button [^>]*font-weight="700"/);
    expect(mjml).toContain('<mj-attributes><mj-all font-family="Arial" /></mj-attributes>');
    expect(mjml).not.toContain('Georgia');
    expect(mjml).toContain('<mj-body background-color="#eee">');
  });

  it('an extra attribute never overrides one the editor sets', () => {
    const { mjml } = new MJMLCompiler().compile({
      version: '1.0',
      metadata: {},
      sections: [
        {
          id: 's',
          type: 'section',
          columns: [{ id: 'c', blocks: [{ id: 'i', type: 'image', src: 'https://a.de/x.png', extraAttributes: { src: 'https://evil.de/y.png' } }] }],
        },
      ],
    });
    expect(mjml).toContain('src="https://a.de/x.png"');
    expect(mjml).not.toContain('evil.de');
  });

  it('a body-level raw section goes straight into mj-body while it holds only raw blocks', () => {
    const base: EmailTemplate = {
      version: '1.0',
      metadata: {},
      sections: [{ id: 's', type: 'section', bodyRaw: true, columns: [{ id: 'c', blocks: [{ id: 'r', type: 'raw', html: '<p>raw</p>' }] }] }],
    };
    expect(new MJMLCompiler().compile(base).mjml).toMatch(/<mj-body>\s*<mj-raw><p>raw<\/p><\/mj-raw>/);
    const mixed = structuredClone(base);
    mixed.sections[0]!.columns[0]!.blocks.push({ id: 't', type: 'text', content: 'hi' });
    expect(new MJMLCompiler().compile(mixed).mjml).toContain('<mj-section');
  });
});
