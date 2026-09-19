import { describe, expect, it } from 'vitest';
import { MJMLCompiler } from '../../compiler/MJMLCompiler';
import type { ButtonBlock, EmailTemplate, ImageBlock, RawBlock, SocialBlock, TextBlock, Wrapper } from '../../schema/types';
import { importMjml } from '../importMjml';
import { MAX_MJML_BYTES, MAX_MJML_DEPTH, MAX_MJML_ELEMENTS, MjmlImportError } from '../types';

const wrap = (inner: string, head = '') => `<mjml>${head ? `<mj-head>${head}</mj-head>` : ''}<mj-body>${inner}</mj-body></mjml>`;
const column = (inner: string) => wrap(`<mj-section><mj-column>${inner}</mj-column></mj-section>`);

function failure(source: string): MjmlImportError {
  try {
    importMjml(source);
  } catch (err) {
    expect(err).toBeInstanceOf(MjmlImportError);
    return err as MjmlImportError;
  }
  throw new Error('expected the import to fail');
}

describe('sources that cannot be imported', () => {
  it('an unclosed element, with the line and column where it opened', () => {
    const err = failure('<mjml>\n  <mj-body>\n    <mj-section>\n  </mj-body>\n</mjml>');
    expect(err.code).toBe('invalid_xml');
    expect(err.line).toBe(4);
    expect(err.column).toBe(3);
    expect(err.message).toMatch(/<\/mj-body> does not match <mj-section> opened on line 3, column 5/);
  });

  it('an element never closed at the end', () => {
    const err = failure('<mjml>\n<mj-body>\n<mj-section>');
    expect(err.code).toBe('invalid_xml');
    expect(err.line).toBe(3);
  });

  it('a stray closing tag, a malformed attribute, a duplicate attribute', () => {
    expect(failure('<mjml><mj-body></mj-column></mj-body></mjml>').code).toBe('invalid_xml');
    expect(failure('<mjml><mj-body><mj-section padding="10px></mj-section></mj-body></mjml>').code).toBe('invalid_xml');
    expect(failure('<mjml><mj-body><mj-section padding="1px" padding="2px"></mj-section></mj-body></mjml>').code).toBe('invalid_xml');
  });

  it('an unclosed content element', () => {
    const err = failure(column('<mj-text>Hello'));
    expect(err.code).toBe('invalid_xml');
    expect(err.message).toMatch(/mj-text> is never closed/);
  });

  it('mj-include is refused, never read from disk', () => {
    const err = failure('<mjml>\n<mj-body>\n  <mj-include path="../../package.json" type="html" />\n</mj-body>\n</mjml>');
    expect(err.code).toBe('include_not_supported');
    expect(err.line).toBe(3);
    expect(err.column).toBe(3);
  });

  it('mj-include inside content is refused too, with where it is (never left for the parser to judge)', () => {
    const err = failure('<mjml><mj-body><mj-section><mj-column>\n<mj-raw><p>x</p>\n  <mj-include path="/etc/passwd" type="html" /></mj-raw>\n</mj-column></mj-section></mj-body></mjml>');
    expect(err.code).toBe('include_not_supported');
    expect(err.line).toBe(3);
    expect(err.column).toBe(3);
    expect(failure(column('<mj-text>< MJ-INCLUDE path="x"></mj-text>')).code).toBe('include_not_supported');
  });

  it('an escaped mj-include inside content is only text, and is kept as such', () => {
    const { document } = importMjml(column('<mj-raw><p>&lt;mj-include&gt; is a tag</p></mj-raw>'));
    expect(JSON.stringify(document)).toContain('mj-include');
  });

  it('not MJML at all: HTML, an empty string, a missing mj-body, text after the root', () => {
    expect(failure('<html><body>hi</body></html>').code).toBe('not_mjml');
    expect(failure('').code).toBe('not_mjml');
    expect(failure('   ').code).toBe('not_mjml');
    expect(failure('<mjml><mj-head></mj-head></mjml>').code).toBe('not_mjml');
    expect(failure(`${wrap('')} trailing`).code).toBe('invalid_xml');
  });

  it('size, depth and element limits', () => {
    expect(failure(column(`<mj-text>${'x'.repeat(MAX_MJML_BYTES)}</mj-text>`)).code).toBe('too_large');
    const deep = `<mjml><mj-body>${'<mj-wrapper>'.repeat(MAX_MJML_DEPTH)}${'</mj-wrapper>'.repeat(MAX_MJML_DEPTH)}</mj-body></mjml>`;
    expect(failure(deep).code).toBe('too_deep');
    const many = column('<mj-spacer height="1px" />'.repeat(MAX_MJML_ELEMENTS + 1));
    expect(failure(many).code).toBe('too_many_elements');
  });

  it('the error survives a worker thread boundary as plain data', () => {
    const err = failure('<mjml><mj-body>');
    expect(JSON.parse(JSON.stringify(err))).toMatchObject({ code: 'invalid_xml', line: 1 });
  });
});

describe('mapping', () => {
  it('head fields become metadata; defaults and body attributes are kept', () => {
    const { document } = importMjml(
      wrap(
        '<mj-section><mj-column><mj-text>x</mj-text></mj-column></mj-section>',
        '<mj-title>T &amp; C</mj-title><mj-preview>Pre</mj-preview><mj-font name="Inter" href="https://f.example/inter.css" /><mj-breakpoint width="520px" /><mj-attributes><mj-all font-family="Inter" /></mj-attributes><mj-style>.a{color:red}</mj-style><mj-style inline="inline">.b{color:blue}</mj-style>',
      ).replace('<mj-body>', '<mj-body background-color="#eee" width="640px">'),
    );
    expect(document.metadata).toMatchObject({
      title: 'T &amp; C',
      previewText: 'Pre',
      fonts: [{ name: 'Inter', href: 'https://f.example/inter.css' }],
      breakpoint: '520px',
      customCSS: '.a{color:red}',
      inlineCSS: '.b{color:blue}',
      mjmlHead: { attributes: '<mj-all font-family="Inter" />', bodyAttributes: { 'background-color': '#eee', width: '640px' } },
    });
  });

  it('no mj-attributes at all means no defaults: the editor does not add its Georgia', () => {
    const { document } = importMjml(column('<mj-text>x</mj-text>'));
    expect(document.metadata.mjmlHead?.attributes).toBe('');
    expect(new MJMLCompiler().compile(document).mjml).not.toContain('Georgia');
  });

  it('attributes the block has become fields, the rest is kept, content is kept byte for byte', () => {
    const { document } = importMjml(
      column(
        '<mj-text align="center" color="#111" font-weight="700" css-class="lead" mj-class="big" padding="4px 8px">Hi <b>there</b> &amp; you<br></mj-text>' +
          '<mj-image src="https://i.example/a.png?x=1&amp;y=2" alt="A" width="120px" />' +
          '<mj-button href="https://example.org" background-color="#0b6e4f" font-size="18px">Go &gt;</mj-button>',
      ),
    );
    const [text, image, button] = document.sections[0]!.columns[0]!.blocks as [TextBlock, ImageBlock, ButtonBlock];
    expect(text).toMatchObject({
      type: 'text',
      content: 'Hi <b>there</b> &amp; you<br>',
      align: 'center',
      color: '#111',
      padding: { top: '4px', right: '8px', bottom: '4px', left: '8px' },
      extraAttributes: { 'font-weight': '700', 'mj-class': 'big', 'css-class': 'lead' },
    });
    expect(image).toMatchObject({ type: 'image', src: 'https://i.example/a.png?x=1&amp;y=2', alt: 'A', width: '120px' });
    expect(button).toMatchObject({ type: 'button', label: 'Go &gt;', href: 'https://example.org', extraAttributes: { 'font-size': '18px' } });
  });

  it('a quote inside a single-quoted value cannot end the attribute, mapped or kept', () => {
    const source = `<mjml><mj-body><mj-section><mj-column><mj-text font-family='Brand "Serif", serif'>Hi</mj-text><mj-button href="https://x.de" font-family='Brand "Sans"'>Go</mj-button></mj-column></mj-section></mj-body></mjml>`;
    const { document } = importMjml(source);
    const [text, button] = document.sections[0]!.columns[0]!.blocks as [TextBlock, ButtonBlock];
    expect(text.fontFamily).toBe('Brand &quot;Serif&quot;, serif');
    expect(button.extraAttributes).toEqual({ 'font-family': 'Brand &quot;Sans&quot;' });
    const compiled = new MJMLCompiler().compile(document);
    expect(compiled.mjml).toContain('font-family="Brand &quot;Serif&quot;, serif"');
    expect(compiled.mjml).toContain('font-family="Brand &quot;Sans&quot;"');
    expect(compiled.html).toContain('Hi');
    expect(compiled.html).toContain('Go');
    expect(importMjml(compiled.mjml).document).toEqual(document);
  });

  it('columns without a width share the section evenly, as MJML does', () => {
    const { document } = importMjml(wrap('<mj-section><mj-column></mj-column><mj-column></mj-column><mj-column></mj-column></mj-section>'));
    expect(document.sections[0]!.columns.map((c) => c.width)).toEqual([100 / 3, 100 / 3, 100 / 3]);
  });

  it('a group of columns becomes a section that does not stack', () => {
    const { document } = importMjml(wrap('<mj-section><mj-group><mj-column><mj-text>a</mj-text></mj-column><mj-column><mj-text>b</mj-text></mj-column></mj-group></mj-section>'));
    expect(document.sections[0]).toMatchObject({ noStack: true });
    expect(document.sections[0]!.columns).toHaveLength(2);
  });

  it('a wrapper becomes a wrapper holding its sections, every mj-wrapper attribute mapped', () => {
    const { document, warnings } = importMjml(
      wrap(
        '<mj-wrapper background-color="#eeeeee" background-url="https://i.example/bg.png" background-position="top left" background-size="cover" background-repeat="no-repeat"' +
          ' border="1px solid #dddddd" border-top="4px solid #0b6e4f" border-right="1px dashed #aaa" border-bottom="2px solid #000" border-left="1px solid #111" border-radius="8px"' +
          ' padding="24px 12px" full-width="full-width" css-class="card promo" gap="16px" text-align="left" direction="rtl">' +
          '<mj-section background-color="#ffffff"><mj-column><mj-text>a</mj-text></mj-column></mj-section>' +
          '<mj-section><mj-group><mj-column><mj-text>b</mj-text></mj-column><mj-column><mj-text>c</mj-text></mj-column></mj-group></mj-section>' +
          '</mj-wrapper>',
      ),
    );
    expect(document.version).toBe('1.1');
    expect(document.sections).toHaveLength(1);
    const wrapper = document.sections[0] as Wrapper;
    expect(wrapper).toMatchObject({
      type: 'wrapper',
      backgroundColor: '#eeeeee',
      backgroundImage: 'https://i.example/bg.png',
      backgroundPosition: 'top left',
      backgroundSize: 'cover',
      backgroundRepeat: 'no-repeat',
      border: '1px solid #dddddd',
      borderTop: '4px solid #0b6e4f',
      borderRight: '1px dashed #aaa',
      borderBottom: '2px solid #000',
      borderLeft: '1px solid #111',
      borderRadius: '8px',
      padding: { top: '24px', right: '12px', bottom: '24px', left: '12px' },
      fullWidth: true,
      cssClass: 'card promo',
      gap: '16px',
      textAlign: 'left',
      // An attribute the inspector has no control for is kept, as on sections.
      extraAttributes: { direction: 'rtl' },
    });
    expect(wrapper.sections).toHaveLength(2);
    expect(wrapper.sections[0]).toMatchObject({ type: 'section', backgroundColor: '#ffffff' });
    // mj-group inside a wrapped section is fine now that the wrapper is its own node.
    expect(wrapper.sections[1]).toMatchObject({ noStack: true });
    expect(warnings.filter((w) => w.severity === 'warning')).toEqual([]);
  });

  it("a wrapper's children the editor cannot hold as sections stay in the wrapper, in place, as raw", () => {
    const source = wrap(
      '<mj-wrapper padding="10px">' +
        '<mj-section><mj-column><mj-text>first</mj-text></mj-column></mj-section>' +
        '<mj-hero background-url="https://i.example/h.png"><mj-text>hero text</mj-text></mj-hero>' +
        '<mj-raw><p>raw markup</p></mj-raw>' +
        '<mj-section><mj-column><mj-text>last</mj-text></mj-column></mj-section>' +
        '<mj-section><!--[if mso]><p>mso</p><![endif]--><mj-column><mj-text>conditional</mj-text></mj-column></mj-section>' +
        '</mj-wrapper>',
    );
    const { document, warnings } = importMjml(source);
    const wrapper = document.sections[0] as Wrapper;
    expect(wrapper.type).toBe('wrapper');
    expect(wrapper.sections.map((s) => (s.bodyRaw ? 'raw' : 'section'))).toEqual(['section', 'raw', 'section', 'raw']);
    // The hero and the mj-raw after it share one raw-only section, in order.
    expect(wrapper.sections[1]!.columns[0]!.blocks.map((b) => b.type)).toEqual(['raw', 'raw']);
    expect((wrapper.sections[1]!.columns[0]!.blocks[0] as RawBlock).html).toContain('hero text');
    expect((wrapper.sections[1]!.columns[0]!.blocks[1] as RawBlock).html).toBe('<p>raw markup</p>');
    expect((wrapper.sections[3]!.columns[0]!.blocks[0] as RawBlock).html).toContain('conditional');
    expect(warnings.filter((w) => w.code === 'kept_as_html').map((w) => w.path)).toEqual([
      'mj-body > mj-wrapper[1] > mj-hero[1]',
      'mj-body > mj-wrapper[1] > mj-section[3]',
    ]);
    // Nothing is dropped: every text of the source is still in the compiled mail.
    const html = new MJMLCompiler().compile(document).html;
    for (const text of ['first', 'hero text', 'raw markup', 'last', 'conditional']) expect(html).toContain(text);
  });

  it('a wrapper inside a wrapper is kept as raw inside the outer one', () => {
    const { document, warnings } = importMjml(
      wrap('<mj-wrapper><mj-wrapper><mj-section><mj-column><mj-text>deep</mj-text></mj-column></mj-section></mj-wrapper></mj-wrapper>'),
    );
    const outer = document.sections[0] as Wrapper;
    expect(outer.sections).toHaveLength(1);
    expect(outer.sections[0]!.bodyRaw).toBe(true);
    expect(warnings.some((w) => w.path === 'mj-body > mj-wrapper[1] > mj-wrapper[1]' && w.code === 'kept_as_html')).toBe(true);
  });

  it('an empty wrapper imports as an empty wrapper', () => {
    const { document } = importMjml(wrap('<mj-wrapper background-color="#eee"></mj-wrapper>'));
    expect(document.sections).toEqual([{ id: expect.any(String), type: 'wrapper', backgroundColor: '#eee', sections: [] }]);
  });

  it('a gap that is not a px length is kept as an attribute, not refused', () => {
    const { document } = importMjml(wrap('<mj-wrapper gap="1em"><mj-section><mj-column></mj-column></mj-section></mj-wrapper>'));
    expect(document.sections[0]).toMatchObject({ extraAttributes: { gap: '1em' } });
    expect((document.sections[0] as Wrapper).gap).toBeUndefined();
  });

  it("the editor's own wrapper export comes back with the same ids", () => {
    const doc: EmailTemplate = {
      version: '1.1',
      metadata: {},
      sections: [
        {
          id: 'wrap-a',
          type: 'wrapper',
          backgroundGradient: { type: 'linear', angle: 90, stops: [{ color: '#111111', position: 0 }, { color: '#222222', position: 100 }] },
          cssClass: 'mine',
          padding: { top: '8px' },
          sections: [{ id: 'sec-a', type: 'section', columns: [{ id: 'col-a', blocks: [{ id: 'txt-a', type: 'text', content: '<p>x</p>' }] }] }],
        },
      ],
    };
    const first = new MJMLCompiler().compile(doc);
    const { document } = importMjml(first.mjml);
    expect(document.sections).toEqual(doc.sections);
    expect(new MJMLCompiler().compile(document).html).toBe(first.html);
  });

  it("a legacy (schema 1.0) editor export of a wrapper section imports as a wrapper with that id", () => {
    const legacy = wrap('<mj-wrapper background-color="#eee" css-class="el-wrapper el-old-1"><mj-section><mj-column css-class="el-column el-c1"><mj-text css-class="el-text el-t1">a</mj-text></mj-column></mj-section></mj-wrapper>');
    const wrapper = importMjml(legacy).document.sections[0] as Wrapper;
    expect(wrapper).toMatchObject({ id: 'old-1', type: 'wrapper', backgroundColor: '#eee' });
    expect(wrapper.sections[0]!.columns[0]!.id).toBe('c1');
  });

  it('navbar, carousel and accordion map with their items', () => {
    const { document } = importMjml(
      column(
        '<mj-navbar hamburger="hamburger"><mj-navbar-link href="/a" color="#111">A</mj-navbar-link></mj-navbar>' +
          '<mj-carousel><mj-carousel-image src="https://i.example/1.png" alt="one" /></mj-carousel>' +
          '<mj-accordion><mj-accordion-element><mj-accordion-title>Q</mj-accordion-title><mj-accordion-text>A</mj-accordion-text></mj-accordion-element></mj-accordion>',
      ),
    );
    expect(document.sections[0]!.columns[0]!.blocks).toMatchObject([
      { type: 'navbar', hamburger: true, links: [{ href: '/a', label: 'A', color: '#111' }] },
      { type: 'carousel', images: [{ src: 'https://i.example/1.png', alt: 'one' }] },
      { type: 'accordion', items: [{ title: 'Q', content: 'A' }] },
    ]);
  });
});

describe('what cannot map is kept, never lost', () => {
  it('an unknown component: a warning with its source, and a Raw block holding the source', () => {
    const { document, warnings } = importMjml(column('<mj-product-card sku="A-17">Secret sauce</mj-product-card><mj-text>after</mj-text>'));
    const w = warnings.find((x) => x.code === 'unknown_component')!;
    expect(w).toMatchObject({ severity: 'warning', path: 'mj-body > mj-section[1] > mj-column[1] > mj-product-card[1]', line: 1 });
    expect(w.fragment).toContain('Secret sauce');
    const blocks = document.sections[0]!.columns[0]!.blocks;
    expect(blocks[0]).toMatchObject({ type: 'raw' });
    expect((blocks[0] as { html: string }).html).toContain('Secret sauce');
    expect(blocks[1]).toMatchObject({ type: 'text', content: 'after' });
  });

  it('mj-social: a warning, and a Raw block with the icons exactly as MJML draws them', () => {
    const { document, warnings } = importMjml(column('<mj-social><mj-social-element name="facebook" href="https://fb.example/me">Follow</mj-social-element></mj-social>'));
    expect(warnings.find((w) => w.code === 'kept_as_html')?.path).toBe('mj-body > mj-section[1] > mj-column[1] > mj-social[1]');
    const raw = document.sections[0]!.columns[0]!.blocks[0] as { type: string; html: string };
    expect(raw.type).toBe('raw');
    expect(raw.html).toContain('https://fb.example/me');
    expect(raw.html).toContain('Follow');
  });

  it('a body-level hero: kept as HTML in a body-level raw section', () => {
    const { document } = importMjml(wrap('<mj-hero background-url="https://i.example/h.jpg"><mj-text>Big words</mj-text></mj-hero>'));
    expect(document.sections[0]).toMatchObject({ bodyRaw: true });
    const html = (document.sections[0]!.columns[0]!.blocks[0] as { html: string }).html;
    expect(html).toContain('Big words');
    expect(html).toContain('https://i.example/h.jpg');
    expect(new MJMLCompiler().compile(document).html).toContain('Big words');
  });

  it('a conditional comment between columns keeps the whole section as HTML', () => {
    const { warnings } = importMjml(wrap('<mj-section><mj-column><mj-text>a</mj-text></mj-column><!--[if mso]><td><![endif]--><mj-column><mj-text>b</mj-text></mj-column></mj-section>'));
    expect(warnings.some((w) => w.code === 'kept_as_html')).toBe(true);
  });

  it('a plain comment between columns is dropped with a note', () => {
    const { warnings } = importMjml(wrap('<mj-section><mj-column><mj-text>a</mj-text></mj-column><!-- right side --><mj-column><mj-text>b</mj-text></mj-column></mj-section>'));
    expect(warnings.find((w) => w.code === 'comment_dropped')?.severity).toBe('info');
  });
});

describe("the editor's own export reads back exactly", () => {
  it('social blocks (both modes), sub-columns and gradients', () => {
    const social: SocialBlock = {
      id: 'soc1',
      type: 'social',
      mode: 'horizontal',
      links: [
        { platform: 'facebook', url: 'https://fb.example' },
        { platform: 'github', url: 'https://gh.example', color: '#123456' },
      ],
    };
    const vertical: SocialBlock = { ...social, id: 'soc2', mode: 'vertical', iconSize: '32px', align: 'left' };
    const doc = {
      version: '1.0' as const,
      metadata: { title: 'x' },
      sections: [
        {
          id: 's1',
          type: 'section' as const,
          backgroundGradient: { type: 'linear' as const, angle: 90, stops: [{ color: '#ff0000', position: 0 }, { color: 'rgba(0, 0, 255, 0.5)', position: 100 }] },
          columns: [
            { id: 'c1', width: 50, blocks: [social, vertical] },
            {
              id: 'c2',
              width: 50,
              blocks: [],
              subColumns: [
                { id: 'sc1', width: 50, blocks: [{ id: 't1', type: 'text' as const, content: 'left' }] },
                { id: 'sc2', width: 50, blocks: [{ id: 't2', type: 'text' as const, content: 'right' }] },
              ],
            },
          ],
        },
      ],
    };
    const first = new MJMLCompiler().compile(doc);
    const { document, warnings } = importMjml(first.mjml);
    expect(warnings.filter((w) => w.severity === 'warning')).toEqual([]);
    const s = document.sections[0]!;
    expect(s.backgroundGradient).toEqual(doc.sections[0]!.backgroundGradient);
    expect(s.columns[0]!.blocks[0]).toEqual(social);
    expect(s.columns[0]!.blocks[1]).toMatchObject({ id: 'soc2', mode: 'vertical', iconSize: '32px', align: 'left', links: [{ platform: 'facebook' }, { platform: 'github', color: '#123456' }] });
    expect(s.columns[1]!.subColumns).toEqual(doc.sections[0]!.columns[1]!.subColumns);
    expect(new MJMLCompiler().compile(document).mjml).toBe(first.mjml);
  });
});
