// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';

const rendered: Array<Record<string, unknown>> = [];

vi.mock('@marlinjai/email-editor-ui', () => ({
  EmailEditor: (props: Record<string, unknown>) => {
    rendered.push(props);
    return null;
  },
}));

import { act } from 'react';
import { createEditor } from '../createEditor';

describe('createEditor', () => {
  beforeEach(() => {
    rendered.length = 0;
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });

  it('hands onRequestImage and the prebuilt sections to the editor', () => {
    const onRequestImage = vi.fn(async () => null);
    const container = document.createElement('div');
    let editor!: ReturnType<typeof createEditor>;
    act(() => {
      editor = createEditor({ container, onRequestImage });
    });
    const props = rendered.at(-1)!;
    expect(props.onRequestImage).toBe(onRequestImage);
    expect(props.prebuiltRegistry).toBeDefined();
    expect(props.blockRegistry).toBeDefined();
    act(() => editor.destroy());
  });

  it('applies the theme as design tokens on the editor root, not on the document', () => {
    const container = document.createElement('div');
    let editor!: ReturnType<typeof createEditor>;
    act(() => {
      editor = createEditor({ container, theme: { colors: { primary: '#0f766e' } } });
    });
    expect(rendered.at(-1)!.style).toMatchObject({ '--ee-accent': '#0f766e' });
    expect(document.documentElement.getAttribute('style')).toBeNull();
    act(() => editor.destroy());
  });

  it('refuses a block definition with a new type before rendering anything', () => {
    const container = document.createElement('div');
    expect(() =>
      createEditor({ container, blocks: [{ type: 'countdown' } as never] })
    ).toThrow(/Unsupported block type/);
    expect(rendered).toHaveLength(0);
  });

  it('renders without onRequestImage (the URL-field fallback)', () => {
    const container = document.createElement('div');
    let editor!: ReturnType<typeof createEditor>;
    act(() => {
      editor = createEditor({ container });
    });
    expect(rendered.at(-1)!.onRequestImage).toBeUndefined();
    act(() => editor.destroy());
  });

  describe('document id', () => {
    const withoutId = () => ({
      version: '1.0' as const,
      metadata: { title: 'No id' },
      sections: [],
    });

    it('opens a document without an id on a copy with a fresh id, and hands that id back before any edit', () => {
      const container = document.createElement('div');
      const input = withoutId();
      let editor!: ReturnType<typeof createEditor>;
      act(() => {
        editor = createEditor({ container, initialValue: input });
      });
      const opened = rendered.at(-1)!.initialTemplate as { id: string };
      expect(typeof opened.id).toBe('string');
      expect(opened.id.length).toBeGreaterThan(0);
      expect('id' in input).toBe(false);
      expect(editor.getValue().id).toBe(opened.id);
      act(() => editor.destroy());
    });

    it('keeps an existing id and the caller object', () => {
      const container = document.createElement('div');
      const input = { ...withoutId(), id: 'tpl_1' };
      let editor!: ReturnType<typeof createEditor>;
      act(() => {
        editor = createEditor({ container, initialValue: input });
      });
      expect(rendered.at(-1)!.initialTemplate).toBe(input);
      expect(editor.getValue()).toBe(input);
      act(() => editor.destroy());
    });

    it('hands onSave the id-bearing document, then what onChange reported', () => {
      const container = document.createElement('div');
      const onSave = vi.fn();
      let editor!: ReturnType<typeof createEditor>;
      act(() => {
        editor = createEditor({ container, initialValue: withoutId(), onSave });
      });
      const props = rendered.at(-1)!;
      const opened = props.initialTemplate as { id: string };
      (props.onSave as () => void)();
      expect(onSave).toHaveBeenLastCalledWith(opened);
      const edited = { ...opened, metadata: { title: 'Edited' } };
      (props.onChange as (t: unknown) => void)(edited);
      (props.onSave as () => void)();
      expect(onSave).toHaveBeenLastCalledWith(edited);
      act(() => editor.destroy());
    });

    it('setValue remounts the editor on the new document', () => {
      const container = document.createElement('div');
      let editor!: ReturnType<typeof createEditor>;
      act(() => {
        editor = createEditor({ container, initialValue: { ...withoutId(), id: 'first' } });
      });
      act(() => editor.setValue({ ...withoutId(), id: 'second' }));
      expect((rendered.at(-1)!.initialTemplate as { id: string }).id).toBe('second');
      expect(editor.getValue().id).toBe('second');
      act(() => editor.setValue(withoutId()));
      const third = rendered.at(-1)!.initialTemplate as { id: string };
      expect(third.id).not.toBe('second');
      expect(editor.getValue().id).toBe(third.id);
      act(() => editor.destroy());
    });
  });
});
