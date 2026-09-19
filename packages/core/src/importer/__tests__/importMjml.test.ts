import { describe, expect, it } from 'vitest';
import { MJMLCompiler } from '../../compiler/MJMLCompiler';
import type { ButtonBlock, ImageBlock, SocialBlock, TextBlock } from '../../schema/types';
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

  it('a wrapper around one plain section is a wrapper section', () => {
    const { document, warnings } = importMjml(wrap('<mj-wrapper background-color="#eee" padding="10px"><mj-section><mj-column><mj-text>a</mj-text></mj-column></mj-section></mj-wrapper>'));
    expect(document.sections[0]).toMatchObject({ isWrapper: true, backgroundColor: '#eee' });
    expect(warnings.filter((w) => w.severity === 'warning')).toEqual([]);
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
