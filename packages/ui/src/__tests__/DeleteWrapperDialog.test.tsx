import React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, act, fireEvent } from '@testing-library/react';
import { createRootStore } from '@marlinjai/email-editor-core';
import { StoreProvider } from '../store';
import { DeleteWrapperDialog } from '../DeleteWrapperDialog';

afterEach(cleanup);

const section = (id: string) => ({ id, type: 'section', columns: [{ id: `${id}-c`, blocks: [] }] });

function setup(inner = [section('b'), section('c')]) {
  const store = createRootStore({
    template: { id: 'd', version: '1.1', metadata: {}, sections: [section('a'), { id: 'w', type: 'wrapper', sections: inner }] } as never,
  });
  render(
    <StoreProvider value={store}>
      <DeleteWrapperDialog />
    </StoreProvider>
  );
  return store;
}

describe('deleting a container asks, in the editor\'s own dialog', () => {
  it('is closed until a delete is requested', () => {
    setup();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('Keep the sections: they take its place, and it is one undo step', () => {
    const store = setup();
    act(() => store.editorUI.requestWrapperDelete('w'));
    const dialog = screen.getByRole('dialog', { name: 'Delete this container?' });
    expect(dialog.textContent).toContain('It holds 2 sections');
    act(() => screen.getByRole('button', { name: 'Keep the sections' }).click());
    expect(store.template.sections.map((s) => s.id)).toEqual(['a', 'b', 'c']);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(store.editorUI.selectedSectionId).toBe('b');
    act(() => void store.undo());
    expect(store.template.getWrapperById('w')?.sections.map((s) => s.id)).toEqual(['b', 'c']);
  });

  it('Delete everything: the sections go too', () => {
    const store = setup();
    act(() => store.editorUI.requestWrapperDelete('w'));
    act(() => screen.getByRole('button', { name: 'Delete everything' }).click());
    expect(store.template.sections.map((s) => s.id)).toEqual(['a']);
  });

  it('Cancel and Escape change nothing', () => {
    const store = setup();
    act(() => store.editorUI.requestWrapperDelete('w'));
    act(() => screen.getByRole('button', { name: 'Cancel' }).click());
    expect(store.editorUI.pendingWrapperDeleteId).toBeUndefined();
    act(() => store.editorUI.requestWrapperDelete('w'));
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(store.editorUI.pendingWrapperDeleteId).toBeUndefined();
    expect(store.template.getWrapperById('w')).toBeDefined();
    expect(store.canUndo).toBe(false);
  });

  it('an empty container just asks to confirm', () => {
    const store = setup([]);
    act(() => store.editorUI.requestWrapperDelete('w'));
    expect(screen.getByRole('dialog').textContent).toContain('It is empty');
    expect(screen.queryByRole('button', { name: 'Keep the sections' })).toBeNull();
    act(() => screen.getByRole('button', { name: 'Delete container' }).click());
    expect(store.template.sections.map((s) => s.id)).toEqual(['a']);
  });
});
