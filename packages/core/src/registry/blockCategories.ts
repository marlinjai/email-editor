// packages/core/src/registry/blockCategories.ts
import { BlockType } from '../store/mst/models/BlockModel';

/**
 * Leaf blocks have no internal structure. Safe to render inside a nested
 * <td> in the email-safe HTML island used for sub-columns.
 */
export const LEAF_BLOCK_TYPES: BlockType[] = [
  BlockType.TEXT,
  BlockType.IMAGE,
  BlockType.BUTTON,
  BlockType.DIVIDER,
  BlockType.SPACER,
  BlockType.SOCIAL,
];

/**
 * Container blocks wrap their own structural HTML (hero with bg + cta,
 * carousel, accordion, table, etc.). Disallowed inside sub-columns
 * because they would compound table nesting beyond what the 85-90%
 * client tier can render reliably.
 */
export const CONTAINER_BLOCK_TYPES: BlockType[] = [
  BlockType.HERO,
  BlockType.ACCORDION,
  BlockType.RAW,
  BlockType.NAVBAR,
  BlockType.CAROUSEL,
  BlockType.TABLE,
  BlockType.HEADER,
  BlockType.FOOTER,
];

export function isLeafBlockType(t: BlockType): boolean {
  return LEAF_BLOCK_TYPES.includes(t);
}
