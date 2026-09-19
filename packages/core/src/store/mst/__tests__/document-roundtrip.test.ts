import { describe, expect, it } from 'vitest';
import { getSnapshot } from 'mobx-state-tree';
import { createRootStore } from '../RootStore';
import { validateTemplate } from '../../../schema/validation';
import type { Block, Column, EmailTemplate, Section } from '../../../schema/types';

/*
 * The store must hand back exactly the document it was given: open a document,
 * take a snapshot, and it deep-equals the input. Every block type with every
 * field set, and sections and columns with every field, so no schema field can
 * be stored under another shape (or dropped) without a failing test.
 */

const pad = { top: '1px', right: '2px', bottom: '3px', left: '4px' };
const extra = { 'css-class': 'x', 'font-weight': '700' };

const BLOCKS: Block[] = [
  { id: 'text', type: 'text', content: '<p>Hi</p>', align: 'justify', color: '#111', fontSize: '15px', fontFamily: 'Arial', padding: pad, lineHeight: '1.5', hidden: true, extraAttributes: extra },
  { id: 'image', type: 'image', src: 'https://i.example/a.png', alt: 'A', width: '120px', height: '40px', align: 'right', href: 'https://x.de', padding: pad, borderRadius: '4px' },
  { id: 'button', type: 'button', label: 'Go', href: 'https://x.de', align: 'left', backgroundColor: '#0b6e4f', color: '#fff', borderRadius: '6px', border: '1px solid #000', padding: pad, innerPadding: '10px 20px' },
  { id: 'divider', type: 'divider', borderColor: '#ddd', borderWidth: '2px', borderStyle: 'dashed', width: '80%', padding: pad },
  { id: 'spacer', type: 'spacer', height: '30px' },
  { id: 'header', type: 'header', locked: true },
  { id: 'footer', type: 'footer', locked: true },
  {
    id: 'social',
    type: 'social',
    links: [{ platform: 'github', url: 'https://gh.example', color: '#123456' }, { platform: 'facebook', url: 'https://fb.example' }],
    iconSize: '32px',
    iconPadding: '6px',
    borderRadius: '4px',
    align: 'left',
    mode: 'vertical',
  },
  { id: 'hero', type: 'hero', backgroundImage: 'https://i.example/h.jpg', backgroundHeight: '300px', backgroundWidth: '600px', backgroundColor: '#222', verticalAlign: 'bottom', mode: 'fixed-height' },
  { id: 'accordion', type: 'accordion', items: [{ title: 'Q', content: 'A' }], iconPosition: 'left', borderColor: '#ccc', fontFamily: 'Arial' },
  { id: 'raw', type: 'raw', html: '<p>raw</p>' },
  { id: 'navbar', type: 'navbar', links: [{ href: '/a', label: 'A', color: '#111' }, { href: '/b', label: 'B' }], hamburger: true, baseUrl: 'https://x.de', align: 'right', icoColor: '#333', padding: pad },
  {
    id: 'carousel',
    type: 'carousel',
    images: [{ src: 'https://i.example/1.png', alt: 'one', href: 'https://x.de', thumbnailSrc: 'https://i.example/t1.png' }, { src: 'https://i.example/2.png' }],
    thumbnails: 'hidden',
    borderRadius: '4px',
    iconWidth: '30px',
    tbBorderRadius: '2px',
    padding: pad,
  },
  { id: 'table', type: 'table', headers: ['A', 'B'], rows: [['1', '2']], align: 'center', color: '#111', fontFamily: 'Arial', fontSize: '13px', cellpadding: '4', cellspacing: '0', border: '1px solid #eee', padding: pad },
];

const FULL_COLUMN: Column = {
  id: 'col-full',
  width: 50,
  backgroundColor: '#fafafa',
  verticalAlign: 'middle',
  padding: pad,
  hidden: false,
  blocks: [],
  extraAttributes: { 'border-radius': '4px' },
};

const GRADIENT_COLUMN: Column = {
  id: 'col-grad',
  width: 50,
  backgroundGradient: { type: 'linear', angle: 90, stops: [{ color: '#f00', position: 0 }, { color: '#00f', position: 100 }] },
  blocks: [],
  subColumns: [
    { id: 'sub-1', width: 40, blocks: [{ id: 'sub-text', type: 'text', content: 'left' }], backgroundColor: '#eee', verticalAlign: 'top', paddingTop: '1px', paddingRight: '2px', paddingBottom: '3px', paddingLeft: '4px' },
    { id: 'sub-2', width: 60, blocks: [] },
  ],
};

const FULL_SECTION: Section = {
  id: 'sec-full',
  type: 'section',
  backgroundColor: '#fff',
  backgroundImage: 'https://i.example/bg.png',
  backgroundPosition: 'center',
  backgroundRepeat: 'no-repeat',
  backgroundSize: 'cover',
  fullWidth: true,
  isWrapper: true,
  noStack: true,
  hidden: false,
  padding: pad,
  bodyRaw: false,
  extraAttributes: { 'border-radius': '8px' },
  columns: [FULL_COLUMN, GRADIENT_COLUMN],
};

function roundTrip(doc: EmailTemplate): EmailTemplate {
  const store = createRootStore({ template: doc as never });
  return JSON.parse(JSON.stringify(getSnapshot(store.template))) as EmailTemplate;
}

/** The smallest valid block of each type: only its required fields. */
const MINIMAL_BLOCKS: Block[] = [
  { id: 'm-text', type: 'text', content: 'x' },
  { id: 'm-image', type: 'image', src: 'https://i.example/a.png' },
  { id: 'm-button', type: 'button', label: 'Go', href: 'https://x.de' },
  { id: 'm-divider', type: 'divider' },
  { id: 'm-spacer', type: 'spacer', height: '10px' },
  { id: 'm-header', type: 'header', locked: true },
  { id: 'm-footer', type: 'footer', locked: true },
  { id: 'm-social', type: 'social', links: [] },
  { id: 'm-hero', type: 'hero', backgroundImage: 'https://i.example/h.jpg' },
  { id: 'm-accordion', type: 'accordion', items: [] },
  { id: 'm-raw', type: 'raw', html: '' },
  { id: 'm-navbar', type: 'navbar', links: [] },
  { id: 'm-carousel', type: 'carousel', images: [] },
  { id: 'm-table', type: 'table', headers: [], rows: [] },
];

/** A document with every metadata field set, around the given sections. */
function doc(sections: Section[]): EmailTemplate {
  return {
    id: 'doc-1',
    version: '1.0',
    metadata: {
      title: 'T',
      subject: 'S',
      previewText: 'P',
      createdAt: 1_700_000_000_000,
      updatedAt: 1_700_000_000_000,
      fonts: [{ name: 'Inter', href: 'https://f.example/inter.css' }],
      themeColors: [{ name: 'Brand', value: '#0b6e4f' }],
      breakpoint: '480px',
      customCSS: '.a{}',
      inlineCSS: '.b{}',
      mjmlHead: { attributes: '<mj-all font-family="Arial" />', bodyAttributes: { 'background-color': '#eee' }, headRaw: '<mj-raw></mj-raw>' },
    },
    sections,
  };
}

const inColumn = (blocks: Block[]): Section[] => [{ id: 's', type: 'section', columns: [{ id: 'c', blocks }] }];

describe('the store gives back exactly the document it was given', () => {
  for (const block of BLOCKS) {
    it(`${block.type}, every field set: deep-equal`, () => {
      const input = doc(inColumn([block]));
      const out = roundTrip(input);
      expect(out).toEqual(input);
      expect(validateTemplate(out).success).toBe(true);
    });
  }

  for (const block of MINIMAL_BLOCKS) {
    it(`${block.type}, only its required fields: deep-equal (no other type's fields, no defaults added)`, () => {
      const input: EmailTemplate = { id: 'd', version: '1.0', metadata: {}, sections: inColumn([block]) };
      expect(roundTrip(input)).toEqual(input);
    });
  }

  it('sections and columns with every field, sub-columns and gradients included: deep-equal', () => {
    const input = doc([FULL_SECTION]);
    expect(roundTrip(input)).toEqual(input);
  });

  it('columns without a width stay without one (MJML shares the section evenly), and so does the compiled mail', () => {
    const input: EmailTemplate = {
      id: 'd',
      version: '1.0',
      metadata: {},
      sections: [{ id: 's', type: 'section', columns: [{ id: 'a', blocks: [] }, { id: 'b', blocks: [] }, { id: 'c', blocks: [] }] }],
    };
    const store = createRootStore({ template: input as never });
    // Inside the store each column holds its share, as the canvas shows it.
    expect(store.template.sections[0]!.columns.map((c) => c.width)).toEqual([100 / 3, 100 / 3, 100 / 3]);
    expect(JSON.parse(JSON.stringify(getSnapshot(store.template)))).toEqual(input);
    // An edited width goes out.
    store.template.sections[0]!.columns[0]!.setWidth(50);
    const out = JSON.parse(JSON.stringify(getSnapshot(store.template))) as EmailTemplate;
    expect(out.sections[0]!.columns.map((c) => c.width)).toEqual([50, undefined, undefined]);
  });

  it('an empty metadata stays empty: no title, dates or theme colours appear on their own', () => {
    const input: EmailTemplate = { id: 'd', version: '1.0', metadata: {}, sections: [] };
    expect(roundTrip(input)).toEqual(input);
  });

  it('dates written as ISO strings come back as written; an edit writes a new one', () => {
    const input: EmailTemplate = { id: 'd', version: '1.0', metadata: { createdAt: '2026-09-01T10:00:00.000Z', updatedAt: '2026-09-02T10:00:00.000Z' }, sections: [] };
    expect(roundTrip(input)).toEqual(input);
    const store = createRootStore({ template: input as never });
    store.template.updateMetadata({ title: 'New' });
    const out = JSON.parse(JSON.stringify(getSnapshot(store.template))) as EmailTemplate;
    expect(out.metadata.createdAt).toBe('2026-09-01T10:00:00.000Z');
    expect(out.metadata.title).toBe('New');
    expect(typeof out.metadata.updatedAt).toBe('number');
  });

  it('a document without an id gets one, and nothing else changes', () => {
    const input: EmailTemplate = { version: '1.0', metadata: {}, sections: inColumn(MINIMAL_BLOCKS) };
    const out = roundTrip(input);
    expect(typeof out.id).toBe('string');
    const { id: _id, ...rest } = out;
    expect(rest).toEqual(input);
  });

  it('the whole editor: every block type in one document, and undo and redo in between, still deep-equal', () => {
    const input = doc([FULL_SECTION, { id: 's2', type: 'section', columns: [{ id: 'c2', blocks: [...BLOCKS, ...MINIMAL_BLOCKS] }] }]);
    const store = createRootStore({ template: input as never });
    store.template.sections[1]!.setPadding({ top: '9px' });
    store.undo();
    expect(JSON.parse(JSON.stringify(getSnapshot(store.template)))).toEqual(input);
  });
});
