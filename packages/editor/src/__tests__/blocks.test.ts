import { describe, it, expect } from 'vitest';
import { createStandardBlockRegistry } from '@marlinjai/email-editor-blocks';
import type { BlockDefinition } from '@marlinjai/email-editor-core';
import { assertSupportedBlocks } from '../blocks';

describe('assertSupportedBlocks', () => {
  it('accepts no blocks', () => {
    expect(() => assertSupportedBlocks([])).not.toThrow();
  });

  it('accepts a redefinition of a standard type', () => {
    const text = createStandardBlockRegistry().get('text')!;
    expect(() => assertSupportedBlocks([{ ...text, label: 'Paragraph' }])).not.toThrow();
  });

  it('refuses a new block type, naming it and the supported ones', () => {
    const custom = { type: 'countdown', label: 'Countdown' } as unknown as BlockDefinition;
    expect(() => assertSupportedBlocks([custom])).toThrow(/Unsupported block type: "countdown".*text, image/);
  });

  it('lists every unsupported type at once', () => {
    const blocks = [{ type: 'a' }, { type: 'text' }, { type: 'b' }] as unknown as BlockDefinition[];
    expect(() => assertSupportedBlocks(blocks)).toThrow(/Unsupported block types: "a", "b"/);
  });
});
