import React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, act, within } from '@testing-library/react';
import { createRootStore } from '@marlinjai/email-editor-core';
import { StoreProvider } from '../../store';
import { LayersPanel } from '../LayersPanel';

afterEach(cleanup);

const section = (id: string) => ({ id, type: 'section', columns: [{ id: `${id}-c`, blocks: [] }] });

function setup() {
  const store = createRootStore({
    template: {
      id: 'd',
      version: '1.1',
      metadata: {},
      sections: [section('a'), { id: 'w', type: 'wrapper', sections: [section('b'), section('c')] }, section('d')],
    } as never,
  });
  render(
    <StoreProvider value={store}>
      <LayersPanel />
    </StoreProvider>
  );
  return store;
}

describe('the Layers panel shows wrappers with their sections one level in', () => {
  it('lists the container and nests its sections, in order', () => {
    setup();
    const rows = screen.getAllByTestId(/^layers-(wrapper|section)-/).map((el) => el.getAttribute('data-testid'));
    expect(rows).toEqual(['layers-section-a', 'layers-wrapper-w', 'layers-section-b', 'layers-section-c', 'layers-section-d']);
    expect(screen.getByTestId('layers-wrapper-w').textContent).toContain('Container, 2 sections');
    // Nested rows are indented under the container.
    expect(screen.getByTestId('layers-section-b').parentElement!.className).toContain('ml-4');
    expect(screen.getByTestId('layers-section-a').parentElement!.className).not.toContain('ml-4');
  });

  it('selecting a container row selects the wrapper', () => {
    const store = setup();
    act(() => screen.getByTestId('layers-wrapper-w').click());
    expect(store.editorUI.selectedWrapperId).toBe('w');
    expect(screen.getByTestId('layers-wrapper-w').getAttribute('aria-selected')).toBe('true');
  });

  it('collapsing a container hides its sections', () => {
    setup();
    act(() => screen.getByRole('button', { name: 'Collapse container' }).click());
    expect(screen.queryByTestId('layers-section-b')).toBeNull();
    act(() => screen.getByRole('button', { name: 'Expand container' }).click());
    expect(screen.getByTestId('layers-section-b')).toBeTruthy();
  });

  it('Wrap in container, Move out of container, Unwrap', () => {
    const store = setup();
    act(() => within(screen.getByTestId('layers-section-a')).getByRole('button', { name: 'Wrap in container' }).click());
    expect(store.template.sections[0]!.type).toBe('wrapper');
    act(() => within(screen.getByTestId('layers-section-c')).getByRole('button', { name: 'Move out of container' }).click());
    expect(store.template.sections.map((s) => s.id).slice(1)).toEqual(['w', 'c', 'd']);
    act(() => within(screen.getByTestId('layers-wrapper-w')).getByRole('button', { name: 'Unwrap container' }).click());
    expect(store.template.sections.map((s) => s.id).slice(1)).toEqual(['b', 'c', 'd']);
  });

  it('Delete container asks through the dialog instead of deleting', () => {
    const store = setup();
    act(() => within(screen.getByTestId('layers-wrapper-w')).getByRole('button', { name: 'Delete container' }).click());
    expect(store.editorUI.pendingWrapperDeleteId).toBe('w');
    expect(store.template.getWrapperById('w')).toBeDefined();
  });

  it('an empty container invites a drop', () => {
    const store = setup();
    act(() => {
      store.template.moveSectionTo('b', { wrapperId: null, index: 0 });
      store.template.moveSectionTo('c', { wrapperId: null, index: 0 });
    });
    expect(screen.getByTestId('layers-end-w').textContent).toContain('Empty: drag a section here');
    expect(screen.getByTestId('layers-wrapper-w').textContent).toContain('Container (empty)');
  });
});
