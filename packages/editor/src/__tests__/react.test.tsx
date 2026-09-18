// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { EmailEditorReact } from '../react';

// The real editor, not a mock: a host passing a document without an id must
// get a working editor (it used to crash on the store's required identifier),
// and the documents it is handed back must carry one stable id.
describe('EmailEditorReact and the document id', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  const withoutId = () => ({
    version: '1.0',
    metadata: { title: 'No id' },
    sections: [],
  });

  it('renders a document without an id and exports it with one stable assigned id, leaving the input alone', () => {
    const input = withoutId();
    const onExport = vi.fn();
    act(() => {
      root.render(<EmailEditorReact initialTemplate={input as never} onExport={onExport} />);
    });
    expect(container.querySelector('.ee-root')).not.toBeNull();
    const exportButton = () => Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes('Export'))!;
    act(() => exportButton().click());
    act(() => exportButton().click());
    expect(onExport).toHaveBeenCalledTimes(2);
    const [first, second] = onExport.mock.calls.map(([t]) => t as { id: string });
    expect(typeof first!.id).toBe('string');
    expect(first!.id.length).toBeGreaterThan(0);
    expect(second!.id).toBe(first!.id);
    expect('id' in input).toBe(false);
  });

  it('keeps an id the document already has', () => {
    const onExport = vi.fn();
    act(() => {
      root.render(<EmailEditorReact initialTemplate={{ ...withoutId(), id: 'tpl_1' } as never} onExport={onExport} />);
    });
    act(() => Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes('Export'))!.click());
    expect((onExport.mock.calls[0]![0] as { id: string }).id).toBe('tpl_1');
  });
});
