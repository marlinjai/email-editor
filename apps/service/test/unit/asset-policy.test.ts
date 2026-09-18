import { createMJMLCompiler } from '@marlinjai/email-editor-core/server';
import { describe, expect, it } from 'vitest';
import {
  applyAssetPolicy,
  cssAddresses,
  loadedAddresses,
  refusal,
  remoteAssetErrors,
  srcsetAddresses,
} from '../../src/compile/asset-policy.js';

const BASE = 'https://mail.lumitra.co';
const OK = 'https://mail.lumitra.co/a/11111111-1111-4111-8111-111111111111';
const EVIL = 'https://tracker.example.com/pixel.png';

const urls = (html: string) => remoteAssetErrors(html, BASE).map((e) => e.message);

describe('refusal', () => {
  it('allows the service host, data: and cid:', () => {
    for (const u of [OK, 'https://MAIL.lumitra.co/a/x', 'data:image/png;base64,AAAA', 'cid:logo@x', 'DATA:image/gif;base64,R0']) {
      expect(refusal(u, 'mail.lumitra.co'), u).toBeNull();
    }
  });

  it('refuses every other host, scheme and shape', () => {
    const cases: [string, RegExp][] = [
      [EVIL, /loads from tracker\.example\.com/],
      ['//tracker.example.com/p.png', /loads from tracker\.example\.com/],
      ['https://mail.lumitra.co.evil.com/a/x', /loads from mail\.lumitra\.co\.evil\.com/],
      ['https://mail.lumitra.co:8443/a/x', /loads from mail\.lumitra\.co:8443/],
      ['https://user@evil.com/a', /loads from evil\.com/],
      ['/a/relative.png', /not an absolute address/],
      ['images/x.png', /not an absolute address/],
      ['ftp://mail.lumitra.co/x.png', /uses ftp/],
      ['javascript:alert(1)', /uses javascript/],
      ['{{avatar_url}}', /merge field/],
      ['https://mail.lumitra.co/a/{{id}}', /merge field/],
      ['', /cannot be checked/],
    ];
    for (const [u, why] of cases) expect(refusal(u, 'mail.lumitra.co'), u).toMatch(why);
  });
});

describe('address extraction', () => {
  it('reads url() in every quoting, @import in both forms and image-set strings, ignoring comments', () => {
    const css = `
      a { background: url(${EVIL}) }
      b { background-image: url( "${OK}" ) }
      c { background: url('https://x.example/c.png') }
      /* d { background: url(https://commented.example/out.png) } */
      @import "https://fonts.example/a.css";
      @import url(https://fonts.example/b.css);
      e { background-image: image-set("https://x.example/1x.png" 1x, 'https://x.example/2x.png' 2x) }
      @font-face { font-family: X; src: url(https://fonts.example/x.woff2) format("woff2"); }
    `;
    expect(cssAddresses(css).sort()).toEqual(
      [
        EVIL,
        OK,
        'https://x.example/c.png',
        'https://fonts.example/a.css',
        'https://fonts.example/b.css',
        'https://x.example/1x.png',
        'https://x.example/2x.png',
        'https://fonts.example/x.woff2',
      ].sort(),
    );
  });

  it('splits srcset candidates, with and without descriptors, keeping commas inside an address', () => {
    expect(srcsetAddresses(`${OK} 1x, ${EVIL} 2x`)).toEqual([OK, EVIL]);
    expect(srcsetAddresses(`${EVIL}`)).toEqual([EVIL]);
    expect(srcsetAddresses('https://x.example/a,b.png 480w, https://y.example/c.png 800w')).toEqual([
      'https://x.example/a,b.png',
      'https://y.example/c.png',
    ]);
  });

  it('decodes entities in attributes', () => {
    expect(loadedAddresses('<img src="https://x.example/a.png?w=1&amp;h=2">')).toEqual([
      { url: 'https://x.example/a.png?w=1&h=2', where: '<img src>' },
    ]);
  });
});

describe('remoteAssetErrors on hand-written HTML', () => {
  it('flags an img src, a srcset, an inline style url(), a head style block, a stylesheet link, @import and @font-face', () => {
    const html = `<!doctype html><html xmlns:v="urn:schemas-microsoft-com:vml"><head>
      <link href="https://fonts.googleapis.com/css?family=Roboto" rel="stylesheet" type="text/css">
      <style type="text/css">
        @import url(https://fonts.googleapis.com/css?family=Lato);
        @font-face { font-family: Brand; src: url('https://cdn.example.com/brand.woff2'); }
        .hero { background-image: url("https://cdn.example.com/hero.jpg"); }
      </style></head>
      <body>
        <img src="${EVIL}" alt="">
        <img src="${OK}" srcset="${OK} 1x, https://cdn.example.com/img@2x.png 2x">
        <div style="background:url(https://cdn.example.com/bg.png) no-repeat">x</div>
        <table background="https://cdn.example.com/table.png"><tr><td>x</td></tr></table>
      </body></html>`;
    const messages = urls(html).join('\n');
    for (const expected of [
      '<link href>: "https://fonts.googleapis.com/css?family=Roboto"',
      '<style>: "https://fonts.googleapis.com/css?family=Lato"',
      '<style>: "https://cdn.example.com/brand.woff2"',
      '<style>: "https://cdn.example.com/hero.jpg"',
      `<img src>: "${EVIL}"`,
      '<img srcset>: "https://cdn.example.com/img@2x.png"',
      '<div style>: "https://cdn.example.com/bg.png"',
      '<table background>: "https://cdn.example.com/table.png"',
    ]) {
      expect(messages).toContain(expected);
    }
    expect(messages).not.toContain(`"${OK}"`);
    expect(urls(html)).toHaveLength(8);
  });

  it('reads markup inside conditional comments (Outlook background images)', () => {
    const html = `<div><!--[if mso | IE]><v:rect style="width:600px;"><v:fill origin="0.5, 0" position="0.5, 0" src="https://cdn.example.com/outlook.jpg" type="tile" /><v:textbox><![endif]--></div>`;
    expect(urls(html).join('\n')).toContain('<v:fill src>: "https://cdn.example.com/outlook.jpg"');
  });

  it('does not flag links, xmlns or the service host', () => {
    const html = `<html xmlns="http://www.w3.org/1999/xhtml" xmlns:o="urn:schemas-microsoft-com:office:office">
      <body><a href="https://anywhere.example.com/page">link</a>
      <!--[if mso]><v:roundrect href="https://anywhere.example.com/cta"></v:roundrect><![endif]-->
      <img src="${OK}"><img src="data:image/gif;base64,R0lGOD"></body></html>`;
    expect(urls(html)).toEqual([]);
  });

  it('reports each address and place once, and summarises a flood', () => {
    expect(urls(`<img src="${EVIL}"><img src="${EVIL}">`)).toHaveLength(1);
    const many = Array.from({ length: 70 }, (_, i) => `<img src="https://x.example/${i}.png">`).join('');
    const messages = urls(many);
    expect(messages).toHaveLength(51);
    expect(messages.at(-1)).toMatch(/And 20 more addresses/);
  });
});

describe('remoteAssetErrors on what the editor compiles', () => {
  const compiler = createMJMLCompiler();
  const doc = (sections: unknown[], metadata: Record<string, unknown> = {}) =>
    ({ version: '1.0', metadata: { title: 'T', ...metadata }, sections }) as never;
  const section = (blocks: unknown[], extra: Record<string, unknown> = {}) => ({
    id: 's1',
    type: 'section',
    ...extra,
    columns: [{ id: 'c1', blocks }],
  });

  it('flags a remote image block and a section background (including its Outlook copy)', () => {
    const { html } = compiler.compile(
      doc([section([{ id: 'i1', type: 'image', src: EVIL }], { backgroundImage: 'https://cdn.example.com/section.jpg' })]),
    );
    const messages = urls(html).join('\n');
    expect(messages).toContain(`"${EVIL}"`);
    expect(messages).toContain('<v:fill src>: "https://cdn.example.com/section.jpg"');
    expect(messages).toMatch(/background.*section\.jpg/);
  });

  it('passes a document whose images are all on the service host', () => {
    const { html } = compiler.compile(
      doc([section([{ id: 'i1', type: 'image', src: OK }], { backgroundImage: OK })]),
      { webFonts: false },
    );
    expect(urls(html)).toEqual([]);
  });

  it('flags a declared web font and MJML automatic Google font, and webFonts: false removes only the automatic one', () => {
    const text = { id: 't1', type: 'text', content: '<p>Hi</p>', fontFamily: 'Brand, Roboto, Arial' };
    const fonts = [{ name: 'Brand', href: 'https://fonts.example.com/brand.css' }];
    const withGoogle = urls(compiler.compile(doc([section([text])], { fonts })).html).join('\n');
    expect(withGoogle).toContain('fonts.googleapis.com');
    expect(withGoogle).toContain('https://fonts.example.com/brand.css');
    const without = urls(compiler.compile(doc([section([text])], { fonts }), { webFonts: false }).html).join('\n');
    expect(without).not.toContain('fonts.googleapis.com');
    expect(without).toContain('https://fonts.example.com/brand.css');
  });

  it('flags remote addresses a raw HTML block brings along', () => {
    const raw = { id: 'r1', type: 'raw', html: `<img src="${EVIL}" srcset="https://cdn.example.com/2x.png 2x"><span style="background:url('https://cdn.example.com/bg.gif')"></span>` };
    const messages = urls(compiler.compile(doc([section([raw])]), { webFonts: false }).html).join('\n');
    expect(messages).toContain(`"${EVIL}"`);
    expect(messages).toContain('"https://cdn.example.com/2x.png"');
    expect(messages).toContain('"https://cdn.example.com/bg.gif"');
  });
});

describe('applyAssetPolicy', () => {
  const result = { mjml: '<mjml/>', html: `<img src="${EVIL}">`, warnings: [], errors: [] };

  it('changes nothing under any', () => {
    expect(applyAssetPolicy(result, 'any', BASE)).toBe(result);
  });

  it('adds errors under service_only, after the compile errors already there', () => {
    const out = applyAssetPolicy({ ...result, errors: [{ message: 'mj-text: bad' }] }, 'service_only', BASE);
    expect(out.errors).toHaveLength(2);
    expect(out.errors[0]!.message).toBe('mj-text: bad');
    expect(out.errors[1]!.message).toMatch(/tracker\.example\.com/);
  });

  it('leaves a failed compile (no HTML) as it is', () => {
    const failed = { mjml: '', html: '', warnings: [], errors: [{ message: 'boom' }] };
    expect(applyAssetPolicy(failed, 'service_only', BASE)).toBe(failed);
  });
});
