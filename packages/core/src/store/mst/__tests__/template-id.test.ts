import { describe, it, expect, vi } from 'vitest';
import { getSnapshot } from 'mobx-state-tree';
import { createRootStore } from '../RootStore';
import { migrateTemplate, withTemplateId } from '../../../schema/migrate';
import { validateTemplate } from '../../../schema/validation';
import { MJMLCompiler } from '../../../compiler/MJMLCompiler';
import type { EmailTemplate } from '../../../schema/types';

// The contract's document and the core schema both treat `id` as optional, so
// the store must open a document without one (the crash the first real client
// hit), keep an id it was given, and hand back a stable id once it assigned one.
function documentWithoutId(): EmailTemplate {
  return {
    version: '1.1',
    metadata: { title: 'No id', subject: 'Hello' },
    sections: [
      {
        id: 's1',
        type: 'section',
        columns: [{ id: 'c1', width: 100, blocks: [{ id: 'b1', type: 'text', content: '<p>Hi</p>' }] }],
      },
    ],
  } as unknown as EmailTemplate;
}

describe('template id', () => {
  it('opens a document without an id, assigns one, and leaves the caller object alone', () => {
    const input = documentWithoutId();
    const frozen = JSON.stringify(input);
    const store = createRootStore({ template: input as never });
    expect(typeof store.template.id).toBe('string');
    expect(store.template.id.length).toBeGreaterThan(0);
    expect(JSON.stringify(input)).toBe(frozen);
    expect('id' in input).toBe(false);
  });

  it('keeps the assigned id across edits, undo and every emitted snapshot', async () => {
    vi.useFakeTimers();
    try {
      const snapshots: Array<{ id: string }> = [];
      const store = createRootStore({
        template: documentWithoutId() as never,
        onChange: (s) => snapshots.push(s as { id: string }),
        onChangeDebounce: 1,
      });
      const assigned = store.template.id;
      store.template.getSectionById('s1')!.columns[0]!.blocks[0]!.setContent('<p>Edited</p>');
      vi.advanceTimersByTime(5);
      store.undo();
      store.redo();
      vi.advanceTimersByTime(5);
      expect(snapshots.length).toBeGreaterThan(0);
      expect(snapshots.every((s) => s.id === assigned)).toBe(true);
      expect(store.template.id).toBe(assigned);
    } finally {
      vi.useRealTimers();
    }
  });

  it('preserves an existing id', () => {
    const store = createRootStore({ template: { ...documentWithoutId(), id: 'tpl_existing' } as never });
    expect(store.template.id).toBe('tpl_existing');
    expect(getSnapshot(store.template).id).toBe('tpl_existing');
  });

  it('loads a document with a different id, or none, into an existing store', () => {
    const store = createRootStore({ template: { ...documentWithoutId(), id: 'first' } as never });
    store.loadTemplate({ ...documentWithoutId(), id: 'second' } as never);
    expect(store.template.id).toBe('second');
    store.loadTemplate(documentWithoutId() as never);
    expect(store.template.id).not.toBe('second');
    expect(store.template.id.length).toBeGreaterThan(0);
    store.resetTemplate('Fresh');
    expect(store.template.metadata.title).toBe('Fresh');
  });

  it('emits a schema-valid document that compiles, with and without an id on the way in', () => {
    for (const input of [documentWithoutId(), { ...documentWithoutId(), id: 'kept' }]) {
      const saved = JSON.parse(JSON.stringify(getSnapshot(createRootStore({ template: input as never }).template)));
      expect(validateTemplate(saved).success).toBe(true);
      expect(migrateTemplate(saved)).toBe(saved);
      const compiled = new MJMLCompiler().compile(saved);
      expect(compiled.errors).toBeUndefined();
      expect(compiled.html).toContain('Hi');
    }
  });

  it('migrateTemplate accepts a document without an id and never adds one', () => {
    const doc = documentWithoutId();
    const migrated = migrateTemplate(doc);
    expect(migrated).toBe(doc);
    expect('id' in migrated).toBe(false);
    expect(new MJMLCompiler().compile(migrated).errors).toBeUndefined();
  });

  it('migrateTemplate refuses an id that is not a string', () => {
    expect(() => migrateTemplate({ ...documentWithoutId(), id: 42 })).toThrow(/does not match/);
  });

  it('withTemplateId copies only when an id is missing', () => {
    const withId = { ...documentWithoutId(), id: 'x' };
    expect(withTemplateId(withId)).toBe(withId);
    const without = documentWithoutId();
    const given = withTemplateId(without);
    expect(given).not.toBe(without);
    expect(given.id.length).toBeGreaterThan(0);
    expect('id' in without).toBe(false);
    expect(withTemplateId({ ...documentWithoutId(), id: '' }).id.length).toBeGreaterThan(0);
  });
});
