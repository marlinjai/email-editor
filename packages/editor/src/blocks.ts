// packages/editor/src/blocks.ts
// Check host-supplied block definitions before they reach the editor

import { BlockType, type BlockDefinition } from '@marlinjai/email-editor-core';

const STANDARD_TYPES = new Set<string>(Object.values(BlockType));

/**
 * The `blocks` option replaces the definition (label, icon, category, default
 * props) of a standard block type. The document schema, the canvas and the
 * server compiler only know the standard types, so a definition with a new
 * type would appear in the palette and then fail when dropped. Refuse it at
 * setup instead, with a message that says what is supported.
 */
export function assertSupportedBlocks(blocks: readonly BlockDefinition[]): void {
  const unsupported = blocks.map((block) => block?.type).filter((type) => !STANDARD_TYPES.has(type));
  if (unsupported.length > 0) {
    throw new Error(
      `Unsupported block type${unsupported.length > 1 ? 's' : ''}: ${unsupported
        .map((type) => JSON.stringify(type))
        .join(', ')}. The blocks option can only redefine a standard block type (${[...STANDARD_TYPES].join(', ')}).`
    );
  }
}
