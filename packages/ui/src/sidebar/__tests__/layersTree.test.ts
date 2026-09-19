import { describe, it, expect } from 'vitest';
import { endRowId, flattenLayers, planLayerDrop, type LayerItem } from '../layersTree';

// a, [w1: b, c], d, [w2: e], [w3: empty]
const ITEMS: LayerItem[] = [
  { id: 'a', type: 'section' },
  { id: 'w1', type: 'wrapper', sections: ['b', 'c'] },
  { id: 'd', type: 'section' },
  { id: 'w2', type: 'wrapper', sections: ['e'] },
  { id: 'w3', type: 'wrapper', sections: [] },
];
const rows = flattenLayers(ITEMS);
const drop = (active: string, over: string) => planLayerDrop(ITEMS, rows, active, over);

describe('flattenLayers', () => {
  it('lists wrappers, their sections one level in, and a row closing each wrapper', () => {
    expect(rows.map((r) => (r.kind === 'section' ? `${r.id}${r.parent ? `@${r.parent}` : ''}` : r.kind === 'wrapper' ? `[${r.id}` : `]${r.parent}`))).toEqual([
      'a', '[w1', 'b@w1', 'c@w1', ']w1', 'd', '[w2', 'e@w2', ']w2', '[w3', ']w3',
    ]);
  });

  it('a collapsed wrapper hides its sections', () => {
    expect(flattenLayers(ITEMS, new Set(['w1'])).map((r) => r.id)).toEqual(['a', 'w1', endRowId('w1'), 'd', 'w2', 'e', endRowId('w2'), 'w3', endRowId('w3')]);
  });
});

describe('planLayerDrop: sections', () => {
  it('into a wrapper: onto its row from above lands first inside', () => {
    expect(drop('a', 'w1')).toEqual({ kind: 'move-section', sectionId: 'a', wrapperId: 'w1', index: 0 });
  });

  it('into a wrapper from below: onto a section inside lands before it', () => {
    expect(drop('d', 'c')).toEqual({ kind: 'move-section', sectionId: 'd', wrapperId: 'w1', index: 1 });
  });

  it('into a wrapper at its end: onto its closing row from below', () => {
    expect(drop('d', endRowId('w1'))).toEqual({ kind: 'move-section', sectionId: 'd', wrapperId: 'w1', index: 2 });
  });

  it('into an empty wrapper: onto its row', () => {
    expect(drop('d', 'w3')).toEqual({ kind: 'move-section', sectionId: 'd', wrapperId: 'w3', index: 0 });
  });

  it('dragged down past an empty wrapper\'s closing row: after the wrapper, at the top level', () => {
    expect(drop('d', endRowId('w3'))).toEqual({ kind: 'move-section', sectionId: 'd', wrapperId: null, index: 4 });
  });

  it('out of a wrapper: past its closing row lands right after the wrapper', () => {
    expect(drop('c', endRowId('w1'))).toEqual({ kind: 'move-section', sectionId: 'c', wrapperId: null, index: 2 });
    // Dragged down onto a top-level section: after it (the list's own move semantics).
    expect(drop('b', 'd')).toEqual({ kind: 'move-section', sectionId: 'b', wrapperId: null, index: 3 });
  });

  it('out of a wrapper to the very top', () => {
    expect(drop('b', 'a')).toEqual({ kind: 'move-section', sectionId: 'b', wrapperId: null, index: 0 });
  });

  it('between wrappers', () => {
    expect(drop('e', 'c')).toEqual({ kind: 'move-section', sectionId: 'e', wrapperId: 'w1', index: 1 });
  });

  it('within a wrapper', () => {
    expect(drop('b', 'c')).toEqual({ kind: 'move-section', sectionId: 'b', wrapperId: 'w1', index: 1 });
  });

  it('a drop that changes nothing is null', () => {
    expect(drop('a', 'a')).toBeNull();
    expect(drop('b', 'b')).toBeNull();
    // Onto the row right after it, inside the same wrapper, then back: c onto b's place is a real move.
    expect(drop('c', 'b')).toEqual({ kind: 'move-section', sectionId: 'c', wrapperId: 'w1', index: 0 });
  });
});

describe('planLayerDrop: wrappers move only at the top level', () => {
  it('onto a top-level section', () => {
    expect(drop('w2', 'a')).toEqual({ kind: 'move-top', itemId: 'w2', index: 0 });
  });

  it('onto a section inside another wrapper: next to that wrapper, never inside it', () => {
    expect(drop('w2', 'b')).toEqual({ kind: 'move-top', itemId: 'w2', index: 1 });
  });

  it('closing rows are never dragged', () => {
    expect(drop(endRowId('w1'), 'a')).toBeNull();
  });

  it('unknown ids are ignored', () => {
    expect(drop('nope', 'a')).toBeNull();
    expect(drop('a', 'nope')).toBeNull();
  });
});
