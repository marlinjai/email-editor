import { describe, it, expect } from 'vitest';
import { getSnapshot } from 'mobx-state-tree';
import { createRootStore, migrateTemplate } from '@marlinjai/email-editor-core';
import { createStandardBlockRegistry, createStandardPrebuiltRegistry } from '../index';

// migrateTemplate must accept every document the editor itself writes, or a
// host that runs it on load would refuse the editor's own output.
describe('migrateTemplate on documents the editor produces', () => {
  it('accepts a fresh editor document', () => {
    const store = createRootStore();
    const snapshot = getSnapshot(store.template);
    expect(migrateTemplate(snapshot)).toBe(snapshot);
  });

  it('accepts a document holding every standard block type', () => {
    const store = createRootStore();
    const columnId = store.template.sections[0].columns[0].id;
    const registry = createStandardBlockRegistry();
    const definitions = registry.getAll();
    expect(definitions.length).toBe(14);
    definitions.forEach((definition, i) => {
      store.template.insertBlock(columnId, {
        id: `block-${i}`,
        type: definition.type,
        ...(definition.defaultProps as object),
      } as never);
    });
    const snapshot = JSON.parse(JSON.stringify(getSnapshot(store.template)));
    expect(() => migrateTemplate(snapshot)).not.toThrow();
  });

  it('accepts a document built from every prebuilt section', () => {
    const store = createRootStore();
    const prebuilt = createStandardPrebuiltRegistry().getAll();
    expect(prebuilt.length).toBeGreaterThan(0);
    prebuilt.forEach((template) => store.template.addSection(template.section as never));
    const snapshot = JSON.parse(JSON.stringify(getSnapshot(store.template)));
    expect(() => migrateTemplate(snapshot)).not.toThrow();
  });
});
