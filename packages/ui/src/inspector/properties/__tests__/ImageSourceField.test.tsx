import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
import { createRootStore, type RootStoreInstance } from '@marlinjai/email-editor-core';
import { StoreProvider } from '../../../store';
import { EditorHostProvider, type OnRequestImage, type RequestedImage } from '../../../host/EditorHostContext';
import { ImageSourceField } from '../ImageSourceField';

afterEach(cleanup);

function setup(onRequestImage?: OnRequestImage, block: Record<string, unknown> = {}) {
  const store = createRootStore();
  const columnId = store.template.allSections[0]!.columns[0]!.id;
  store.template.insertBlock(columnId, {
    id: 'img',
    type: 'image',
    src: 'https://cdn.example.com/old.png',
    alt: 'Old alt',
    ...block,
  } as never);
  const imageBlock = store.template.findBlockById('img')!;
  const utils = render(
    <StoreProvider value={store}>
      <EditorHostProvider onRequestImage={onRequestImage}>
        <ImageSourceField block={imageBlock} />
      </EditorHostProvider>
    </StoreProvider>
  );
  return { store, block: imageBlock, ...utils };
}

/** A promise the test resolves or rejects by hand, to observe the pending state. */
function deferred() {
  let resolve!: (value: RequestedImage | null) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<RequestedImage | null>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function historyLength(store: RootStoreInstance) {
  return store.history.length;
}

describe('ImageSourceField without onRequestImage', () => {
  it('falls back to the URL field and writes what the user types', () => {
    const { block } = setup();
    const input = screen.getByPlaceholderText('https://...') as HTMLInputElement;
    expect(input.value).toBe('https://cdn.example.com/old.png');
    expect(screen.queryByRole('button')).toBeNull();
    fireEvent.change(input, { target: { value: 'https://cdn.example.com/typed.png' } });
    expect(block.src).toBe('https://cdn.example.com/typed.png');
  });
});

describe('ImageSourceField with onRequestImage', () => {
  it('shows a button instead of the URL field', () => {
    setup(vi.fn());
    expect(screen.queryByPlaceholderText('https://...')).toBeNull();
    expect(screen.getByRole('button', { name: /replace image/i })).toBeTruthy();
  });

  it('labels the button "Choose image" when the block has no image yet', () => {
    setup(vi.fn(), { src: undefined });
    expect(screen.getByRole('button', { name: /choose image/i })).toBeTruthy();
    expect(screen.getByText('No image chosen yet.')).toBeTruthy();
  });

  it('passes the block context to the host', async () => {
    const onRequestImage = vi.fn().mockResolvedValue(null);
    setup(onRequestImage);
    await act(async () => fireEvent.click(screen.getByRole('button')));
    expect(onRequestImage).toHaveBeenCalledWith({
      blockId: 'img',
      blockType: 'image',
      currentUrl: 'https://cdn.example.com/old.png',
      currentAlt: 'Old alt',
    });
  });

  it('applies the chosen url and alt as a single undo step', async () => {
    const { block, store } = setup(async () => ({ url: 'https://cdn.example.com/new.png', alt: 'New alt' }));
    const before = historyLength(store);
    await act(async () => fireEvent.click(screen.getByRole('button')));
    expect(block.src).toBe('https://cdn.example.com/new.png');
    expect(block.alt).toBe('New alt');
    expect(historyLength(store)).toBe(before + 1);
  });

  it('keeps the existing alt text when the host returns none', async () => {
    const { block } = setup(async () => ({ url: 'https://cdn.example.com/new.png' }));
    await act(async () => fireEvent.click(screen.getByRole('button')));
    expect(block.src).toBe('https://cdn.example.com/new.png');
    expect(block.alt).toBe('Old alt');
  });

  it('trims the returned url', async () => {
    const { block } = setup(async () => ({ url: '  https://cdn.example.com/new.png  ' }));
    await act(async () => fireEvent.click(screen.getByRole('button')));
    expect(block.src).toBe('https://cdn.example.com/new.png');
  });

  it('leaves the block unchanged when the host cancels (null)', async () => {
    const { block, store } = setup(async () => null);
    const before = historyLength(store);
    await act(async () => fireEvent.click(screen.getByRole('button')));
    expect(block.src).toBe('https://cdn.example.com/old.png');
    expect(block.alt).toBe('Old alt');
    expect(historyLength(store)).toBe(before);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('disables the button while the host is working, and re-enables it after', async () => {
    const pending = deferred();
    setup(() => pending.promise);
    const button = screen.getByRole('button') as HTMLButtonElement;
    await act(async () => fireEvent.click(button));
    expect(button.disabled).toBe(true);
    expect(button.getAttribute('aria-busy')).toBe('true');
    expect(button.textContent).toMatch(/waiting for image/i);
    await act(async () => pending.resolve(null));
    expect(button.disabled).toBe(false);
  });

  it('does not ask the host twice while a request is open', async () => {
    const pending = deferred();
    const onRequestImage = vi.fn(() => pending.promise);
    setup(onRequestImage);
    const button = screen.getByRole('button');
    await act(async () => fireEvent.click(button));
    await act(async () => fireEvent.click(button));
    expect(onRequestImage).toHaveBeenCalledTimes(1);
    await act(async () => pending.resolve(null));
  });

  it('shows a rejection inline, leaves the block unchanged, and clears the error on a successful retry', async () => {
    const onRequestImage = vi
      .fn<Parameters<OnRequestImage>, ReturnType<OnRequestImage>>()
      .mockRejectedValueOnce(new Error('Upload failed: file too large'))
      .mockResolvedValueOnce({ url: 'https://cdn.example.com/retry.png' });
    const { block } = setup(onRequestImage);

    await act(async () => fireEvent.click(screen.getByRole('button')));
    expect(screen.getByRole('alert').textContent).toBe('Upload failed: file too large');
    expect(block.src).toBe('https://cdn.example.com/old.png');
    expect((screen.getByRole('button') as HTMLButtonElement).disabled).toBe(false);

    await act(async () => fireEvent.click(screen.getByRole('button')));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(block.src).toBe('https://cdn.example.com/retry.png');
  });

  it('shows a generic message when the rejection carries none', async () => {
    setup(() => Promise.reject(undefined));
    await act(async () => fireEvent.click(screen.getByRole('button')));
    expect(screen.getByRole('alert').textContent).toMatch(/could not be loaded/i);
  });

  it('treats a result without a url as an error, not as an empty image', async () => {
    const { block } = setup(async () => ({ url: '   ' }));
    await act(async () => fireEvent.click(screen.getByRole('button')));
    expect(screen.getByRole('alert').textContent).toMatch(/no image URL/i);
    expect(block.src).toBe('https://cdn.example.com/old.png');
  });

  it('does not write, or crash, when the block was deleted while the picker was open', async () => {
    const pending = deferred();
    const { store, unmount } = setup(() => pending.promise);
    await act(async () => fireEvent.click(screen.getByRole('button')));
    // Deleting the selected block unmounts its inspector, as the editor does.
    unmount();
    act(() => {
      store.template.deleteBlock('img');
    });
    await act(async () => pending.resolve({ url: 'https://cdn.example.com/late.png' }));
    expect(store.template.findBlockById('img')).toBeUndefined();
  });

  it('still applies the image after the inspector unmounted (the user selected another block)', async () => {
    const pending = deferred();
    const { block, unmount } = setup(() => pending.promise);
    await act(async () => fireEvent.click(screen.getByRole('button')));
    unmount();
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    await act(async () => pending.resolve({ url: 'https://cdn.example.com/late.png' }));
    expect(block.src).toBe('https://cdn.example.com/late.png');
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
  });

  it('keeps a late rejection for one block off the inspector of the block now shown', async () => {
    const pending = deferred();
    const store = createRootStore();
    const columnId = store.template.allSections[0]!.columns[0]!.id;
    store.template.insertBlock(columnId, { id: 'a', type: 'image', src: 'https://cdn.example.com/a.png' } as never);
    store.template.insertBlock(columnId, { id: 'b', type: 'image', src: 'https://cdn.example.com/b.png' } as never);
    const view = (id: string) => (
      <StoreProvider value={store}>
        <EditorHostProvider onRequestImage={() => pending.promise}>
          <ImageSourceField block={store.template.findBlockById(id)!} />
        </EditorHostProvider>
      </StoreProvider>
    );
    const { rerender } = render(view('a'));
    await act(async () => fireEvent.click(screen.getByRole('button')));
    rerender(view('b')); // the user selected block b while a's picker was open
    await act(async () => pending.reject(new Error('Upload failed')));
    expect(screen.queryByRole('alert')).toBeNull();
    expect((screen.getByRole('button') as HTMLButtonElement).disabled).toBe(false);
  });
});
