import { describe, it, expect } from 'vitest';
import { getSnapshot, applySnapshot } from 'mobx-state-tree';
import { createRootStore } from '../RootStore';
import { validateTemplate } from '../../../schema/validation';

// The store's snapshots are what hosts persist, so they must be documents the
// schema accepts, and the store must open the documents the schema describes.
describe('store snapshot boundary', () => {
  const navbarLinks = [
    { label: 'Home', href: 'https://example.com' },
    { label: 'Shop', href: 'https://example.com/shop', color: '#ff0000' },
  ];

  function storeWithNavbar() {
    const store = createRootStore();
    const columnId = store.template.sections[0].columns[0].id;
    store.template.insertBlock(columnId, { id: 'nav', type: 'navbar', links: navbarLinks } as never);
    return store;
  }

  it('reads a navbar stored with `links` into the store', () => {
    const block = storeWithNavbar().template.findBlockById('nav')!;
    expect(block.navLinks.map((l) => l.label)).toEqual(['Home', 'Shop']);
    expect(block.links.length).toBe(0);
  });

  it('emits a navbar with its links under `links`, schema-valid', () => {
    const snapshot = JSON.parse(JSON.stringify(getSnapshot(storeWithNavbar().template)));
    const stored = snapshot.sections[0].columns[0].blocks.find((b: { id: string }) => b.id === 'nav');
    expect(stored.links).toEqual(navbarLinks);
    expect(stored.navLinks).toBeUndefined();
    expect(validateTemplate(snapshot).success).toBe(true);
  });

  it('keeps navbar links through an undo-style re-apply of its own snapshot', () => {
    const store = storeWithNavbar();
    const snapshot = getSnapshot(store.template);
    applySnapshot(store.template, snapshot);
    expect(store.template.findBlockById('nav')!.navLinks.length).toBe(2);
  });

  it('still reads a navbar persisted with `navLinks`', () => {
    const store = createRootStore();
    const columnId = store.template.sections[0].columns[0].id;
    store.template.insertBlock(columnId, { id: 'old', type: 'navbar', navLinks: navbarLinks } as never);
    expect(store.template.findBlockById('old')!.navLinks.length).toBe(2);
  });

  it('leaves social links untouched', () => {
    const store = createRootStore();
    const columnId = store.template.sections[0].columns[0].id;
    store.template.insertBlock(columnId, {
      id: 'soc',
      type: 'social',
      links: [{ platform: 'facebook', url: 'https://facebook.com/x' }],
    } as never);
    const snapshot = JSON.parse(JSON.stringify(getSnapshot(store.template)));
    expect(snapshot.sections[0].columns[0].blocks.find((b: { id: string }) => b.id === 'soc').links).toEqual([
      { platform: 'facebook', url: 'https://facebook.com/x' },
    ]);
  });

  it('opens a document whose dates are ISO strings (a JSON round trip of Date)', () => {
    const store = createRootStore({
      template: {
        id: 't',
        version: '1.0',
        metadata: { title: 'T', createdAt: '2026-09-01T10:00:00.000Z', updatedAt: '2026-09-02T10:00:00.000Z' },
        sections: [],
      } as never,
    });
    expect(store.template.metadata.createdAt.toISOString()).toBe('2026-09-01T10:00:00.000Z');
    expect(store.template.metadata.updatedAt.toISOString()).toBe('2026-09-02T10:00:00.000Z');
  });

  it('falls back to now for an unparseable date instead of refusing the document', () => {
    const before = Date.now();
    const store = createRootStore({
      template: { id: 't', version: '1.0', metadata: { createdAt: 'not a date' }, sections: [] } as never,
    });
    expect(store.template.metadata.createdAt.getTime()).toBeGreaterThanOrEqual(before);
  });
});
