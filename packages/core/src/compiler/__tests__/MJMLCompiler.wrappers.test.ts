import mjml2html from 'mjml';
import { describe, expect, it } from 'vitest';
import { allPrebuiltTemplates } from '../../../../blocks/src/prebuilt';
import { migrateTemplate } from '../../schema/migrate';
import type { EmailTemplate, Section, Wrapper } from '../../schema/types';
import { signature } from '../../importer/__tests__/signature';
import { DEFAULT_MJML_ATTRIBUTES, MJMLCompiler } from '../MJMLCompiler';

const compiler = new MJMLCompiler();

/** MJML's own rendering of a hand-written body, with the head the compiler writes for `metadata: {}`. */
function reference(body: string): string {
  const source = `<mjml><mj-head><mj-attributes>${DEFAULT_MJML_ATTRIBUTES}</mj-attributes></mj-head><mj-body>${body}</mj-body></mjml>`;
  return mjml2html(source, { validationLevel: 'soft', minify: false }).html;
}

/** HTML with the whitespace between tags normalised: MJML's output keeps the indentation of its source. */
const normalise = (html: string) => html.replace(/>\s+</g, '><').replace(/\s+/g, ' ').trim();

const section = (id: string, text: string, extra: Partial<Section> = {}): Section => ({
  id,
  type: 'section',
  columns: [{ id: `${id}-col`, blocks: [{ id: `${id}-txt`, type: 'text', content: text }] }],
  ...extra,
});
const sectionMjml = (id: string, text: string, attrs = '') =>
  `<mj-section ${attrs}css-class="el-section el-${id}"><mj-column css-class="el-column el-${id}-col"><mj-text css-class="el-text el-${id}-txt">${text}</mj-text></mj-column></mj-section>`;
const doc = (...sections: EmailTemplate['sections']): EmailTemplate => ({ version: '1.1', metadata: {}, sections });

describe('wrappers compile like the equivalent hand-written MJML', () => {
  it('every wrapper attribute, and the sections inside', () => {
    const wrapper: Wrapper = {
      id: 'w1',
      type: 'wrapper',
      backgroundColor: '#f4f4f4',
      backgroundImage: 'https://images.example.org/bg.png',
      backgroundPosition: 'top left',
      backgroundRepeat: 'no-repeat',
      backgroundSize: 'cover',
      border: '1px solid #dddddd',
      borderTop: '4px solid #0b6e4f',
      borderRight: '2px dashed #aaaaaa',
      borderBottom: '3px solid #000000',
      borderLeft: '1px dotted #111111',
      borderRadius: '8px',
      padding: { top: '24px', right: '12px', bottom: '24px', left: '12px' },
      fullWidth: true,
      cssClass: 'card promo',
      gap: '16px',
      textAlign: 'left',
      extraAttributes: { direction: 'rtl' },
      sections: [section('s1', 'First'), section('s2', 'Second', { backgroundColor: '#ffffff', padding: { top: '8px', bottom: '8px' } })],
    };
    const compiled = compiler.compile(doc(wrapper));
    expect(compiled.errors).toBeUndefined();
    const expected = reference(
      '<mj-wrapper background-color="#f4f4f4" background-url="https://images.example.org/bg.png" background-position="top left" background-repeat="no-repeat" background-size="cover"' +
        ' border="1px solid #dddddd" border-top="4px solid #0b6e4f" border-right="2px dashed #aaaaaa" border-bottom="3px solid #000000" border-left="1px dotted #111111" border-radius="8px"' +
        ' full-width="full-width" padding="24px 12px 24px 12px" gap="16px" text-align="left" direction="rtl" css-class="el-wrapper el-w1 card promo">' +
        sectionMjml('s1', 'First') +
        sectionMjml('s2', 'Second', 'background-color="#ffffff" padding="8px 0 8px 0" ') +
        '</mj-wrapper>',
    );
    expect(normalise(compiled.html)).toBe(normalise(expected));
  });

  it('wrappers and sections side by side at the top level, in order', () => {
    const compiled = compiler.compile(
      doc(section('a', 'Alpha'), { id: 'w', type: 'wrapper', backgroundColor: '#eeeeee', sections: [section('b', 'Beta')] }, section('c', 'Gamma')),
    );
    const expected = reference(
      sectionMjml('a', 'Alpha') + `<mj-wrapper background-color="#eeeeee" css-class="el-wrapper el-w">${sectionMjml('b', 'Beta')}</mj-wrapper>` + sectionMjml('c', 'Gamma'),
    );
    expect(normalise(compiled.html)).toBe(normalise(expected));
  });

  it('a gradient background: the first stop as the fallback colour, and the rule in the head', () => {
    const compiled = compiler.compile(
      doc({ id: 'g', type: 'wrapper', backgroundGradient: { type: 'linear', angle: 90, stops: [{ color: '#111111', position: 0 }, { color: '#222222', position: 100 }] }, sections: [section('s', 'x')] }),
    );
    expect(compiled.mjml).toContain('<mj-wrapper background-color="#111111" css-class="el-wrapper el-g el-grad-g">');
    expect(compiled.mjml).toContain('.el-grad-g { background-image: linear-gradient(90deg, #111111 0%, #222222 100%); }');
  });

  it('a hidden wrapper emits nothing; a hidden section inside a wrapper is left out', () => {
    const hidden = compiler.compile(doc({ id: 'h', type: 'wrapper', hidden: true, sections: [section('s', 'Hidden text')] }));
    expect(hidden.mjml).not.toContain('mj-wrapper');
    expect(hidden.html).not.toContain('Hidden text');
    const inner = compiler.compile(doc({ id: 'w', type: 'wrapper', sections: [section('a', 'Shown'), section('b', 'Gone', { hidden: true })] }));
    expect(inner.html).toContain('Shown');
    expect(inner.html).not.toContain('Gone');
  });

  it('an empty wrapper compiles (MJML renders its box)', () => {
    const compiled = compiler.compile(doc({ id: 'e', type: 'wrapper', backgroundColor: '#abcdef', sections: [] }));
    expect(compiled.errors).toBeUndefined();
    expect(normalise(compiled.html)).toBe(normalise(reference('<mj-wrapper background-color="#abcdef" css-class="el-wrapper el-e"></mj-wrapper>')));
  });

  it('a raw-only section inside a wrapper goes back as mj-raw inside the mj-wrapper', () => {
    const raw: Section = { id: 'r', type: 'section', bodyRaw: true, columns: [{ id: 'rc', blocks: [{ id: 'rb', type: 'raw', html: '<p>kept</p>' }] }] };
    const compiled = compiler.compile(doc({ id: 'w', type: 'wrapper', sections: [section('a', 'A'), raw] }));
    expect(compiled.mjml).toMatch(/<mj-wrapper [^>]*>\s*<mj-section[\s\S]*<\/mj-section>\s*<mj-raw><p>kept<\/p><\/mj-raw>\s*<\/mj-wrapper>/);
  });

  it('a quote in a value cannot end its attribute', () => {
    const compiled = compiler.compile(doc({ id: 'q', type: 'wrapper', border: '1px solid "red"', cssClass: 'a"b', sections: [] }));
    expect(compiled.mjml).toContain('border="1px solid &quot;red&quot;"');
    expect(compiled.mjml).toContain('css-class="el-wrapper el-q a&quot;b"');
  });

  it('a full-width section inside a full-width wrapper renders at standard width (MJML rule the inspector explains)', () => {
    const fw = (sectionFull: boolean) =>
      compiler.compile(doc({ id: 'w', type: 'wrapper', fullWidth: true, sections: [section('s', 'x', { fullWidth: sectionFull })] })).html;
    // The section's own background table is not stretched to 100% of the viewport either way.
    expect(fw(true)).toContain('max-width:600px');
    expect(fw(false)).toContain('max-width:600px');
  });
});

describe('schema 1.0 documents compile exactly as before', () => {
  const legacyDocs: Array<[string, unknown]> = allPrebuiltTemplates.map((t) => [
    t.id,
    { version: '1.0', metadata: { title: t.name }, sections: [structuredClone(t.section)] },
  ]);

  it.each(legacyDocs)('%s: migrating to 1.1 changes nothing in the MJML or the HTML', (_id, legacy) => {
    const before = compiler.compile(legacy as EmailTemplate);
    const after = compiler.compile(migrateTemplate(structuredClone(legacy)));
    expect(after.mjml).toBe(before.mjml);
    expect(after.html).toBe(before.html);
  });

  it('a 1.0 isWrapper section compiles, after migration, to the mail the 1.0 compiler wrote', () => {
    const legacy = {
      version: '1.0',
      metadata: {},
      sections: [
        {
          id: 'w',
          type: 'section',
          isWrapper: true,
          backgroundColor: '#eeeeee',
          padding: { top: '10px', bottom: '10px' },
          extraAttributes: { 'border-radius': '6px' },
          columns: [{ id: 'c', blocks: [{ id: 't', type: 'text', content: '<p>Inside</p>' }] }],
        },
      ],
    };
    // What the 1.0 compiler emitted for it: the section's attributes on the wrapper, a bare section inside.
    const before = reference(
      '<mj-wrapper background-color="#eeeeee" padding="10px 0 10px 0" border-radius="6px" css-class="el-wrapper el-w"><mj-section><mj-column css-class="el-column el-c"><mj-text css-class="el-text el-t"><p>Inside</p></mj-text></mj-column></mj-section></mj-wrapper>',
    );
    const after = compiler.compile(migrateTemplate(legacy)).html;
    expect(signature(after)).toEqual(signature(before));
    // Only the inner section's class differs.
    expect(normalise(after).replace(/ class="el-section el-w-inner"/g, '').replace(/class="el-section-outlook el-w-inner-outlook"/g, 'class=""')).toBe(normalise(before));
  });
});
