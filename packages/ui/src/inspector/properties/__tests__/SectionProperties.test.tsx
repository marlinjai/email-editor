import React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, act } from '@testing-library/react';
import { createRootStore } from '@marlinjai/email-editor-core';
import { StoreProvider } from '../../../store';
import { SectionProperties } from '../SectionProperties';

afterEach(cleanup);

/** A section whose columns are opened from a stored document, widths as given (or left out). */
function setup(columns: Array<{ id: string; width?: number; hidden?: boolean }>) {
  const store = createRootStore({
    template: {
      id: 'd',
      version: '1.0',
      metadata: {},
      sections: [{ id: 's', type: 'section', columns: columns.map((c) => ({ ...c, blocks: [] })) }],
    } as never,
  });
  const section = store.template.sections[0]!;
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
