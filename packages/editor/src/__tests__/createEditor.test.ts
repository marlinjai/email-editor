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
});
