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
