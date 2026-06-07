import { describe, it, expect } from 'vitest';
import { BlockType } from '../../store/mst/models/BlockModel';
import { LEAF_BLOCK_TYPES, CONTAINER_BLOCK_TYPES, isLeafBlockType } from '../blockCategories';

describe('block categories', () => {
  it('classifies leaf blocks', () => {
    expect(LEAF_BLOCK_TYPES).toEqual(
      expect.arrayContaining([
        BlockType.TEXT, BlockType.IMAGE, BlockType.BUTTON,
        BlockType.DIVIDER, BlockType.SPACER, BlockType.SOCIAL,
      ]),
    );
  });

  it('classifies container blocks', () => {
    expect(CONTAINER_BLOCK_TYPES).toEqual(
      expect.arrayContaining([
        BlockType.HERO, BlockType.ACCORDION, BlockType.RAW,
        BlockType.NAVBAR, BlockType.CAROUSEL, BlockType.TABLE,
        BlockType.HEADER, BlockType.FOOTER,
      ]),
    );
  });

  it('isLeafBlockType returns true for text, false for hero', () => {
    expect(isLeafBlockType(BlockType.TEXT)).toBe(true);
    expect(isLeafBlockType(BlockType.HERO)).toBe(false);
  });

  it('every BlockType is exactly one of leaf or container', () => {
    const all = Object.values(BlockType);
    for (const t of all) {
      const inLeaf = LEAF_BLOCK_TYPES.includes(t);
      const inContainer = CONTAINER_BLOCK_TYPES.includes(t);
      expect(inLeaf !== inContainer).toBe(true);
    }
  });
});
