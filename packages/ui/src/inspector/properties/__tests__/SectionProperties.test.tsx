import React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, act, fireEvent } from '@testing-library/react';
import { createRootStore } from '@marlinjai/email-editor-core';
import { StoreProvider } from '../../../store';
import { SectionProperties } from '../SectionProperties';

afterEach(cleanup);

/** A section whose columns are opened from a stored document, widths as given (or left out). */
function setup(
  columns: Array<{ id: string; width?: number; hidden?: boolean }>,
  options: { wrapper?: { fullWidth?: boolean; backgroundImage?: string }; section?: Record<string, unknown> } = {}
) {
  const section0 = { id: 's', type: 'section', columns: columns.map((c) => ({ ...c, blocks: [] })), ...options.section };
  const store = createRootStore({
    template: {
      id: 'd',
      version: '1.1',
      metadata: {},
      sections: options.wrapper ? [{ id: 'w', type: 'wrapper', ...options.wrapper, sections: [section0] }] : [section0],
    } as never,
  });
  const section = store.template.allSections[0]!;
  render(
    <StoreProvider value={store}>
      <SectionProperties section={section} />
    </StoreProvider>
  );
  return { store, section };
}

describe('the section inspector warns when its columns overflow', () => {
  it('60% and a column without a width: 110% (MJML gives the second 50%), the last one wraps', () => {
    const { section } = setup([{ id: 'a', width: 60 }, { id: 'b' }]);
    expect(section.columns.map((c) => c.width)).toEqual([60, 50]);
    expect(screen.getByTestId('section-columns-overflow').textContent).toBe(
      'These columns add up to 110%, so the last one wraps below on desktop.'
    );
  });

  it('no warning when the columns fit, with or without widths', () => {
    setup([{ id: 'a' }, { id: 'b' }, { id: 'c' }]);
    expect(screen.queryByTestId('section-columns-overflow')).toBeNull();
    cleanup();
    setup([{ id: 'a', width: 60 }, { id: 'b', width: 40 }]);
    expect(screen.queryByTestId('section-columns-overflow')).toBeNull();
  });

  it('follows edits: fixing a width removes the warning, a hidden column does not count', () => {
    const { section } = setup([{ id: 'a', width: 60 }, { id: 'b' }]);
    act(() => section.columns[1]!.setWidth(40));
    expect(screen.queryByTestId('section-columns-overflow')).toBeNull();
    act(() => section.columns[1]!.setWidth(70));
    expect(screen.getByTestId('section-columns-overflow').textContent).toContain('130%');
    cleanup();
    setup([{ id: 'a', width: 60 }, { id: 'b', width: 60, hidden: true }]);
    expect(screen.queryByTestId('section-columns-overflow')).toBeNull();
  });
});

describe('the section inspector inside a container', () => {
  it('still warns when the columns overflow', () => {
    setup([{ id: 'a', width: 60 }, { id: 'b', width: 60 }], { wrapper: {} });
    expect(screen.getByTestId('section-columns-overflow').textContent).toContain('120%');
  });

  it('Full Width cannot be switched on, and says why; an imported full-width section can be switched off', () => {
    setup([{ id: 'a' }], { wrapper: {} });
    const box = screen.getByRole('checkbox', { name: 'Full Width' }) as HTMLInputElement;
    expect(box.disabled).toBe(true);
    expect(screen.getByText(/a section is as wide as the container's content/)).toBeTruthy();
    cleanup();
    const { section } = setup([{ id: 'a' }], { wrapper: { fullWidth: true }, section: { fullWidth: true } });
    const on = screen.getByRole('checkbox', { name: 'Full Width' }) as HTMLInputElement;
    expect(on.disabled).toBe(false);
    expect(screen.getByText(/Inside a full-width container, MJML draws sections at standard width/)).toBeTruthy();
    act(() => on.click());
    expect(section.fullWidth).toBe(false);
  });

  it('warns when the container and the section both have a background image', () => {
    setup([{ id: 'a' }], { wrapper: { backgroundImage: 'https://i.example/w.png' }, section: { backgroundImage: 'https://i.example/s.png' } });
    expect(screen.getByText(/Outlook on Windows cannot show both/)).toBeTruthy();
  });

  it('Select container and Move out', () => {
    const { store } = setup([{ id: 'a' }], { wrapper: {} });
    act(() => screen.getByRole('button', { name: 'Move out' }).click());
    expect(store.template.sections.map((s) => s.id)).toEqual(['w', 's']);
    cleanup();
    const again = setup([{ id: 'a' }], { wrapper: {} });
    act(() => screen.getByRole('button', { name: 'Select container' }).click());
    expect(again.store.editorUI.selectedWrapperId).toBe('w');
  });
});

describe('the section inspector at the top level', () => {
  it('Wrap in container puts the section in a new container and selects it', () => {
    const { store } = setup([{ id: 'a' }]);
    act(() => screen.getByRole('button', { name: 'Wrap in container' }).click());
    const w = store.template.sections[0]!;
    expect(w.type).toBe('wrapper');
    expect(store.editorUI.selectedWrapperId).toBe(w.id);
    expect(store.template.findWrapperBySectionId('s')?.id).toBe(w.id);
  });

  it('Full Width is a plain toggle', () => {
    const { section } = setup([{ id: 'a' }]);
    const box = screen.getByRole('checkbox', { name: 'Full Width' }) as HTMLInputElement;
    expect(box.disabled).toBe(false);
    act(() => box.click());
    expect(section.fullWidth).toBe(true);
  });
});

describe('the section background', () => {
  it('Image mode can be chosen before any image is set (it shows the image control)', () => {
    const { section } = setup([{ id: 'a' }]);
    act(() => screen.getByRole('button', { name: 'image' }).click());
    const url = screen.getByLabelText('Image URL');
    act(() => void fireEvent.change(url, { target: { value: 'https://i.example/s.png' } }));
    expect(section.backgroundImage).toBe('https://i.example/s.png');
  });
});

describe('joining a neighbouring container without a drag', () => {
  it('the container above: at its end; the one below: at its start', () => {
    const store = createRootStore({
      template: {
        id: 'd',
        version: '1.1',
        metadata: {},
        sections: [
          { id: 'w1', type: 'wrapper', sections: [{ id: 'x', type: 'section', columns: [{ id: 'xc', blocks: [] }] }] },
          { id: 's', type: 'section', columns: [{ id: 'sc', blocks: [] }] },
          { id: 'w2', type: 'wrapper', sections: [{ id: 'y', type: 'section', columns: [{ id: 'yc', blocks: [] }] }] },
        ],
      } as never,
    });
    render(
      <StoreProvider value={store}>
        <SectionProperties section={store.template.getSectionById('s')!} />
      </StoreProvider>
    );
    expect(screen.getByRole('button', { name: 'Add to the container below' })).toBeTruthy();
    act(() => screen.getByRole('button', { name: 'Add to the container above' }).click());
    expect(store.template.getWrapperById('w1')!.sections.map((x) => x.id)).toEqual(['x', 's']);
    act(() => void store.undo());
    cleanup();
    render(
      <StoreProvider value={store}>
        <SectionProperties section={store.template.getSectionById('s')!} />
      </StoreProvider>
    );
    act(() => screen.getByRole('button', { name: 'Add to the container below' }).click());
    expect(store.template.getWrapperById('w2')!.sections.map((x) => x.id)).toEqual(['s', 'y']);
  });
});
