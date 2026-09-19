import React from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, act, fireEvent } from '@testing-library/react';
import { createRootStore, type WrapperInstance } from '@marlinjai/email-editor-core';
import { StoreProvider } from '../../../store';
import { EditorHostProvider, type OnRequestImage } from '../../../host/EditorHostContext';
import { WrapperProperties, parseGap } from '../WrapperProperties';

afterEach(cleanup);

function setup(wrapper: Record<string, unknown> = {}, onRequestImage?: OnRequestImage) {
  const store = createRootStore({
    template: {
      id: 'd',
      version: '1.1',
      metadata: {},
      sections: [
        { id: 'w', type: 'wrapper', sections: [{ id: 's1', type: 'section', columns: [{ id: 'c1', blocks: [] }] }, { id: 's2', type: 'section', columns: [{ id: 'c2', blocks: [] }] }], ...wrapper },
      ],
    } as never,
  });
  const w = store.template.getWrapperById('w') as WrapperInstance;
  render(
    <StoreProvider value={store}>
      <EditorHostProvider onRequestImage={onRequestImage}>
        <WrapperProperties wrapper={w} />
      </EditorHostProvider>
    </StoreProvider>
  );
  return { store, w };
}

const type = (label: string, value: string) => act(() => void fireEvent.change(screen.getByLabelText(label), { target: { value } }));

describe('the container inspector edits every wrapper prop', () => {
  it('background colour, padding, border (all and per side), radius, gap, full width, alignment, class', () => {
    const { w } = setup();
    type('Background colour', '#123456');
    expect(w.backgroundColor).toBe('#123456');

    type('Padding top', '24');
    type('Padding left', '8px');
    expect([w.paddingTop, w.paddingLeft]).toEqual(['24px', '8px']);

    type('Border', '1px solid #dddddd');
    expect(w.border).toBe('1px solid #dddddd');
    act(() => screen.getByRole('button', { name: 'Set each side' }).click());
    type('Border top', '4px solid #0b6e4f');
    type('Border right', '1px dashed #aaa');
    type('Border bottom', '2px solid #000');
    type('Border left', '1px dotted #111');
    expect([w.borderTop, w.borderRight, w.borderBottom, w.borderLeft]).toEqual(['4px solid #0b6e4f', '1px dashed #aaa', '2px solid #000', '1px dotted #111']);
    type('Border top', '');
    expect(w.borderTop).toBeUndefined();

    type('Corner radius', '8px');
    expect(w.borderRadius).toBe('8px');

    type('Gap between sections', '16');
    expect(w.gap).toBe('16px');

    act(() => screen.getByRole('checkbox', { name: 'Full width' }).click());
    expect(w.fullWidth).toBe(true);

    act(() => screen.getByRole('button', { name: 'left' }).click());
    expect(w.textAlign).toBe('left');
    // The active one again unsets it.
    act(() => screen.getByRole('button', { name: 'left' }).click());
    expect(w.textAlign).toBeUndefined();

    type('CSS class', 'card promo');
    expect(w.cssClass).toBe('card promo');
  });

  it('a gap that is not a px length shows an error and is not written', () => {
    const { w } = setup({ gap: '12px' });
    type('Gap between sections', '1em');
    expect(screen.getByRole('alert').textContent).toMatch(/length in px/);
    expect(w.gap).toBe('12px');
    type('Gap between sections', '');
    expect(w.gap).toBeUndefined();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('padding placeholders show MJML\'s default when none is set', () => {
    setup();
    expect((screen.getByLabelText('Padding top') as HTMLInputElement).placeholder).toBe('20px');
    expect((screen.getByLabelText('Padding left') as HTMLInputElement).placeholder).toBe('0px');
  });

  it('gradient and image modes; the image comes from the host picker and a cancel changes nothing', async () => {
    const picker = vi.fn<Parameters<OnRequestImage>, ReturnType<OnRequestImage>>()
      .mockResolvedValueOnce({ url: 'https://cdn.example.com/bg.png' })
      .mockResolvedValueOnce(null)
      .mockRejectedValueOnce(new Error('Upload failed: too large'));
    const { w } = setup({}, picker);

    act(() => screen.getByRole('button', { name: 'gradient' }).click());
    expect(w.backgroundGradient?.type).toBe('linear');

    act(() => screen.getByRole('button', { name: 'image' }).click());
    expect(w.backgroundGradient).toBeUndefined();
    await act(async () => screen.getByRole('button', { name: 'Choose background image' }).click());
    expect(picker).toHaveBeenLastCalledWith({ blockId: 'w', blockType: 'wrapper', currentUrl: undefined });
    expect(w.backgroundImage).toBe('https://cdn.example.com/bg.png');

    await act(async () => screen.getByRole('button', { name: 'Replace background image' }).click());
    expect(w.backgroundImage).toBe('https://cdn.example.com/bg.png');

    await act(async () => screen.getByRole('button', { name: 'Replace background image' }).click());
    expect(screen.getByRole('alert').textContent).toBe('Upload failed: too large');

    fireEvent.change(screen.getByLabelText('Image size'), { target: { value: 'cover' } });
    fireEvent.change(screen.getByLabelText('Image position'), { target: { value: 'center center' } });
    act(() => screen.getByRole('button', { name: 'no-repeat' }).click());
    expect([w.backgroundSize, w.backgroundPosition, w.backgroundRepeat]).toEqual(['cover', 'center center', 'no-repeat']);

    act(() => screen.getByRole('button', { name: 'Remove' }).click());
    expect(w.backgroundImage).toBeUndefined();
  });

  it('without a host picker, the background image is a URL field', () => {
    act(() => void 0);
    const { w } = setup({ backgroundImage: 'https://i.example/a.png' });
    type('Image URL', 'https://i.example/b.png');
    expect(w.backgroundImage).toBe('https://i.example/b.png');
  });

  it('kept import attributes are listed', () => {
    setup({ extraAttributes: { direction: 'rtl' } });
    expect(screen.getByTestId('wrapper-kept-attributes').textContent).toContain('direction');
  });
});

describe('the container actions', () => {
  it('Unwrap puts the sections in its place and selects the first', () => {
    const { store } = setup();
    act(() => screen.getByRole('button', { name: 'Unwrap' }).click());
    expect(store.template.sections.map((s) => s.id)).toEqual(['s1', 's2']);
    expect(store.editorUI.selectedSectionId).toBe('s1');
  });

  it('Duplicate selects the copy; Delete asks (it does not delete by itself)', () => {
    const { store } = setup();
    act(() => screen.getByRole('button', { name: 'Duplicate' }).click());
    expect(store.template.sections).toHaveLength(2);
    expect(store.editorUI.selectedWrapperId).not.toBe('w');
    cleanup();
    const again = setup();
    act(() => screen.getByRole('button', { name: 'Delete' }).click());
    expect(again.store.editorUI.pendingWrapperDeleteId).toBe('w');
    expect(again.store.template.sections).toHaveLength(1);
  });

  it('every edit is one undo step', () => {
    const { store, w } = setup();
    type('Corner radius', '8px');
    act(() => void store.undo());
    expect(w.borderRadius).toBeUndefined();
    act(() => void store.redo());
    expect(w.borderRadius).toBe('8px');
  });
});

describe('parseGap', () => {
  it.each([
    ['', { value: undefined }],
    ['16', { value: '16px' }],
    [' 16px ', { value: '16px' }],
    ['0', { value: '0px' }],
    ['1.5px', { value: '1.5px' }],
  ])('%j', (input, expected) => expect(parseGap(input)).toEqual(expected));

  it.each(['1em', '-4px', 'wide', '10 px'])('refuses %j', (input) => expect(parseGap(input)).toHaveProperty('error'));
});
