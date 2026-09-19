import { describe, expect, it } from 'vitest';
import { getSnapshot } from 'mobx-state-tree';
import { createRootStore, type RootStoreInstance } from '../RootStore';
import { isWrapperInstance } from '../models/TemplateModel';
import type { WrapperInstance } from '../models/WrapperModel';
import { validateTemplate } from '../../../schema/validation';
import { migrateTemplate } from '../../../schema/migrate';
import { MJMLCompiler } from '../../../compiler/MJMLCompiler';
import type { EmailTemplate, Section, Wrapper } from '../../../schema/types';

/*
 * Wrappers in the store: the same snapshot boundary as sections (a document
 * comes back exactly as it went in), and every wrapper operation is one step
 * of the undo history that undo reverses exactly and redo re-applies.
 */

const section = (id: string, extra: Partial<Section> = {}): Section => ({
  id,
  type: 'section',
  columns: [{ id: `${id}-c`, blocks: [{ id: `${id}-t`, type: 'text', content: `<p>${id}</p>` }] }],
  ...extra,
});

const FULL_WRAPPER: Wrapper = {
  id: 'w-full',
  type: 'wrapper',
  hidden: false,
  backgroundColor: '#f4f4f4',
  backgroundImage: 'https://i.example/bg.png',
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
  sections: [section('in-1', { backgroundColor: '#ffffff', padding: { top: '8px' } }), section('in-2', { bodyRaw: false })],
};

const GRADIENT_WRAPPER: Wrapper = {
  id: 'w-grad',
  type: 'wrapper',
  backgroundGradient: { type: 'radial', angle: 0, stops: [{ color: '#111111', position: 0 }, { color: '#222222', position: 100 }] },
  sections: [],
};

const doc = (sections: EmailTemplate['sections']): EmailTemplate => ({ id: 'doc', version: '1.1', metadata: {}, sections });

const snap = (store: RootStoreInstance) => JSON.parse(JSON.stringify(getSnapshot(store.template))) as EmailTemplate;
const open = (d: EmailTemplate) => createRootStore({ template: structuredClone(d) as never });
const wrapperOf = (store: RootStoreInstance, id: string) => store.template.getWrapperById(id) as WrapperInstance;
const topIds = (store: RootStoreInstance) => store.template.sections.map((s) => s.id);
const inner = (store: RootStoreInstance, id: string) => wrapperOf(store, id).sections.map((s) => s.id);

describe('the store gives back exactly the wrapper it was given', () => {
  it.each([
    ['every field set', FULL_WRAPPER],
    ['a gradient background, empty', GRADIENT_WRAPPER],
    ['only its required fields', { id: 'w-min', type: 'wrapper', sections: [] } as Wrapper],
    ['one padding side', { id: 'w-pad', type: 'wrapper', padding: { left: '10px' }, sections: [section('p')] } as Wrapper],
  ])('%s: deep-equal, valid, and it compiles', (_name, wrapper) => {
    const input = doc([section('before'), wrapper, section('after')]);
    const out = snap(open(input));
    expect(out).toEqual(input);
    expect(validateTemplate(out).success).toBe(true);
    expect(new MJMLCompiler().compile(out).errors).toBeUndefined();
  });

  it('a default the store fills (hidden, full width) goes back out only when changed', () => {
    const input = doc([{ id: 'w', type: 'wrapper', sections: [] }]);
    const store = open(input);
    const w = wrapperOf(store, 'w');
    expect(w.hidden).toBe(false);
    expect(w.fullWidth).toBe(false);
    w.toggleFullWidth();
    expect(snap(store).sections[0]).toMatchObject({ fullWidth: true });
    w.toggleFullWidth();
    expect(snap(store)).toEqual(input);
  });

  it('a 1.0 isWrapper section opens as a wrapper, as migrateTemplate takes it', () => {
    const legacy = {
      id: 'doc',
      version: '1.0',
      metadata: {},
      sections: [{ ...section('legacy'), isWrapper: true, backgroundColor: '#eee' }],
    };
    const store = createRootStore({ template: structuredClone(legacy) as never });
    expect(isWrapperInstance(store.template.sections[0])).toBe(true);
    expect(snap(store)).toEqual(migrateTemplate(structuredClone(legacy)));
  });
});

describe('every wrapper operation is one undo step', () => {
  const START = doc([section('a'), section('b'), FULL_WRAPPER, section('c'), { id: 'w2', type: 'wrapper', sections: [section('d')] }]);

  /** Runs an edit, checks it did something, then undo gives back the exact document and redo the edited one. */
  function undoable(edit: (store: RootStoreInstance) => void, check: (store: RootStoreInstance) => void) {
    const store = open(START);
    const before = snap(store);
    edit(store);
    check(store);
    const after = snap(store);
    expect(after).not.toEqual(before);
    expect(validateTemplate(after).success).toBe(true);
    expect(store.undo()).toBe(true);
    expect(snap(store)).toEqual(before);
    expect(store.redo()).toBe(true);
    expect(snap(store)).toEqual(after);
  }

  const PROPS: Array<[string, Record<string, unknown>]> = [
    ['backgroundColor', { backgroundColor: '#000000' }],
    ['backgroundImage', { backgroundImage: 'https://i.example/other.png' }],
    ['backgroundGradient', { backgroundGradient: { type: 'linear', angle: 45, stops: [{ color: '#fff', position: 0 }] } }],
    ['backgroundPosition', { backgroundPosition: 'center center' }],
    ['backgroundRepeat', { backgroundRepeat: 'repeat' }],
    ['backgroundSize', { backgroundSize: 'contain' }],
    ['border', { border: '2px solid red' }],
    ['borderTop', { borderTop: undefined }],
    ['borderRight', { borderRight: '1px solid blue' }],
    ['borderBottom', { borderBottom: '1px solid green' }],
    ['borderLeft', { borderLeft: '0' }],
    ['borderRadius', { borderRadius: '0px' }],
    ['padding', { paddingTop: '4px', paddingLeft: undefined }],
    ['fullWidth', { fullWidth: false }],
    ['cssClass', { cssClass: 'other' }],
    ['gap', { gap: '0px' }],
    ['textAlign', { textAlign: 'center' }],
  ];

  it.each(PROPS)('%s', (_name, update) => {
    undoable(
      (s) => wrapperOf(s, 'w-full').updateProperties(update),
      (s) => {
        const w = wrapperOf(s, 'w-full') as unknown as Record<string, unknown>;
        for (const [k, v] of Object.entries(update)) expect(w[k]).toEqual(v);
      },
    );
  });

  it('hide', () => undoable((s) => wrapperOf(s, 'w-full').toggleHidden(), (s) => expect(wrapperOf(s, 'w-full').hidden).toBe(true)));

  it('add a wrapper from the palette (around one empty section)', () =>
    undoable(
      (s) => s.template.addWrapper(undefined, 1),
      (s) => {
        const added = s.template.sections[1]!;
        expect(isWrapperInstance(added)).toBe(true);
        expect((added as WrapperInstance).sections).toHaveLength(1);
      },
    ));

  it('wrap a section in a container, in its place', () =>
    undoable(
      (s) => s.template.wrapSection('b'),
      (s) => {
        expect(isWrapperInstance(s.template.sections[1])).toBe(true);
        expect((s.template.sections[1] as WrapperInstance).sections.map((x) => x.id)).toEqual(['b']);
      },
    ));

  it('unwrap: the sections take the wrapper\'s place, in order', () =>
    undoable(
      (s) => expect(s.template.unwrap('w-full')).toEqual(['in-1', 'in-2']),
      (s) => expect(topIds(s)).toEqual(['a', 'b', 'in-1', 'in-2', 'c', 'w2']),
    ));

  it('delete a wrapper, keeping its sections', () =>
    undoable(
      (s) => s.template.removeWrapper('w-full', { keepSections: true }),
      (s) => expect(topIds(s)).toEqual(['a', 'b', 'in-1', 'in-2', 'c', 'w2']),
    ));

  it('delete a wrapper and everything in it', () =>
    undoable(
      (s) => s.template.removeWrapper('w-full', { keepSections: false }),
      (s) => {
        expect(topIds(s)).toEqual(['a', 'b', 'c', 'w2']);
        expect(s.template.getSectionById('in-1')).toBeUndefined();
      },
    ));

  it('drag a section into a wrapper', () =>
    undoable(
      (s) => expect(s.template.moveSectionTo('a', { wrapperId: 'w-full', index: 1 })).toBe(true),
      (s) => {
        expect(inner(s, 'w-full')).toEqual(['in-1', 'a', 'in-2']);
        expect(topIds(s)).toEqual(['b', 'w-full', 'c', 'w2']);
      },
    ));

  it('drag a section out of a wrapper', () =>
    undoable(
      (s) => s.template.moveSectionTo('in-2', { wrapperId: null, index: 0 }),
      (s) => {
        expect(topIds(s)[0]).toBe('in-2');
        expect(inner(s, 'w-full')).toEqual(['in-1']);
      },
    ));

  it('drag a section from one wrapper to another', () =>
    undoable(
      (s) => s.template.moveSectionTo('in-1', { wrapperId: 'w2', index: 1 }),
      (s) => {
        expect(inner(s, 'w2')).toEqual(['d', 'in-1']);
        expect(inner(s, 'w-full')).toEqual(['in-2']);
      },
    ));

  it('reorder sections within a wrapper', () =>
    undoable(
      (s) => s.template.moveSectionTo('in-1', { wrapperId: 'w-full', index: 1 }),
      (s) => expect(inner(s, 'w-full')).toEqual(['in-2', 'in-1']),
    ));

  it('the last section leaves: the wrapper stays, empty, with its styling', () =>
    undoable(
      (s) => s.template.moveSectionTo('d', { wrapperId: null, index: 0 }),
      (s) => {
        expect(inner(s, 'w2')).toEqual([]);
        expect(isWrapperInstance(s.template.sections.find((x) => x.id === 'w2'))).toBe(true);
      },
    ));

  it('reorder wrappers at the top level', () =>
    undoable(
      (s) => s.template.moveSection('w2', 0),
      (s) => expect(topIds(s)).toEqual(['w2', 'a', 'b', 'w-full', 'c']),
    ));

  it('duplicate a wrapper: everything inside gets new ids', () =>
    undoable(
      (s) => s.template.duplicateWrapper('w-full'),
      (s) => {
        const copy = s.template.sections[3] as WrapperInstance;
        expect(isWrapperInstance(copy)).toBe(true);
        expect(copy.id).not.toBe('w-full');
        expect(copy.sections.map((x) => x.id)).not.toContain('in-1');
        expect(copy.sections[0]!.columns[0]!.blocks[0]!.id).not.toBe('in-1-t');
        expect(copy.borderTop).toBe('4px solid #0b6e4f');
      },
    ));

  it('duplicate a section inside a wrapper: the copy stays in the wrapper, right after it', () =>
    undoable(
      (s) => s.template.duplicateSection('in-1'),
      (s) => expect(inner(s, 'w-full')).toHaveLength(3),
    ));

  it('add a section into a wrapper, and remove one from it', () => {
    undoable((s) => s.template.addSection(section('new'), 0, 'w2'), (s) => expect(inner(s, 'w2')).toEqual(['new', 'd']));
    undoable((s) => s.template.removeSection('in-2'), (s) => expect(inner(s, 'w-full')).toEqual(['in-1']));
  });

  it('edit a section inside a wrapper', () =>
    undoable(
      (s) => s.template.getSectionById('in-1')!.updateProperties({ backgroundColor: '#123456' }),
      (s) => expect(s.template.getSectionById('in-1')!.backgroundColor).toBe('#123456'),
    ));
});

describe('refused and unknown targets change nothing', () => {
  const START = doc([section('a'), { id: 'w', type: 'wrapper', sections: [section('b')] }]);

  it('wrapSection of a section already in a wrapper, or of a wrapper, is refused', () => {
    const store = open(START);
    expect(store.template.wrapSection('b')).toBeUndefined();
    expect(store.template.wrapSection('w')).toBeUndefined();
    expect(snap(store)).toEqual(START);
    expect(store.canUndo).toBe(false);
  });

  it('unknown ids', () => {
    const store = open(START);
    expect(store.template.unwrap('nope')).toEqual([]);
    expect(store.template.removeWrapper('nope', { keepSections: false })).toBe(false);
    expect(store.template.moveSectionTo('nope', { wrapperId: null, index: 0 })).toBe(false);
    expect(store.template.moveSectionTo('a', { wrapperId: 'nope', index: 0 })).toBe(false);
    expect(store.template.duplicateWrapper('a')).toBeUndefined();
    expect(() => store.template.addSection(section('x'), 0, 'nope')).toThrow(/No wrapper/);
    expect(snap(store)).toEqual(START);
  });

  it('a wrapper cannot go inside a wrapper (moveSectionTo moves sections only)', () => {
    const store = open(doc([{ id: 'w1', type: 'wrapper', sections: [] }, { id: 'w2', type: 'wrapper', sections: [] }]));
    expect(store.template.moveSectionTo('w1', { wrapperId: 'w2', index: 0 })).toBe(false);
  });

  it('an index past the end lands at the end', () => {
    const store = open(START);
    store.template.moveSectionTo('a', { wrapperId: 'w', index: 99 });
    expect(inner(store, 'w')).toEqual(['b', 'a']);
  });
});

describe('selection', () => {
  it('selecting a wrapper clears every other level, and the other way round', () => {
    const store = open(doc([{ id: 'w', type: 'wrapper', sections: [section('b')] }]));
    store.editorUI.selectSection('b');
    store.editorUI.selectWrapper('w');
    expect(store.editorUI.selectedSectionId).toBeUndefined();
    expect(store.selectedWrapper?.id).toBe('w');
    expect(store.editorUI.selectionType).toBe('wrapper');
    store.editorUI.selectBlock('b-t');
    expect(store.editorUI.selectedWrapperId).toBeUndefined();
  });

  it('undoing the wrapper away clears its selection and a pending delete', () => {
    const store = open(doc([section('a')]));
    const w = store.template.wrapSection('a')!;
    store.editorUI.selectWrapper(w.id);
    store.editorUI.requestWrapperDelete(w.id);
    store.undo();
    expect(store.editorUI.selectedWrapperId).toBeUndefined();
    expect(store.editorUI.pendingWrapperDeleteId).toBeUndefined();
  });

  it('a section, block and column inside a wrapper are found by id', () => {
    const store = open(doc([{ id: 'w', type: 'wrapper', sections: [section('b')] }]));
    expect(store.template.getSectionById('b')?.id).toBe('b');
    expect(store.template.findColumnById('b-c')?.id).toBe('b-c');
    expect(store.template.findBlockById('b-t')?.id).toBe('b-t');
    expect(store.template.findWrapperBySectionId('b')?.id).toBe('w');
    expect(store.template.findWrapperBySectionId('w')).toBeUndefined();
    expect(store.template.sectionCount).toBe(1);
    expect(store.template.totalBlockCount).toBe(1);
  });
});
