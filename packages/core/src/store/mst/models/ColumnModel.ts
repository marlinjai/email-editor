// packages/core/src/store/mst/models/ColumnModel.ts
import { types, Instance, SnapshotIn, SnapshotOut, destroy, detach } from 'mobx-state-tree';
import { nanoid } from 'nanoid';
import { BlockModel, BlockInstance, BlockSnapshotIn, BlockType } from './BlockModel';
import type { CSSProperties } from '../types';

/**
 * ColumnModel - A column within a section
 *
 * Columns contain blocks and have their own styling properties.
 * A section can have 1-4 columns.
 */
export const ColumnModel = types
  .model('Column', {
    id: types.identifier,
    width: types.optional(types.number, 100), // percentage (e.g., 50 for 50%)
    backgroundColor: types.maybe(types.string),
    verticalAlign: types.maybe(types.enumeration(['top', 'middle', 'bottom'])),
    paddingTop: types.maybe(types.string),
    paddingRight: types.maybe(types.string),
    paddingBottom: types.maybe(types.string),
    paddingLeft: types.maybe(types.string),
    hidden: types.optional(types.boolean, false),
    blocks: types.array(BlockModel),
  })
  .actions(self => ({
    /**
     * Add a block to this column
     */
    addBlock(block: BlockSnapshotIn | BlockInstance, index?: number) {
      const blockToAdd = BlockModel.is(block) ? detach(block) : BlockModel.create(block as BlockSnapshotIn);
      if (index !== undefined && index >= 0 && index <= self.blocks.length) {
        self.blocks.splice(index, 0, blockToAdd);
      } else {
        self.blocks.push(blockToAdd);
      }
      return blockToAdd;
    },

    /**
     * Remove a block by ID
     */
    removeBlock(blockId: string) {
      const block = self.blocks.find(b => b.id === blockId);
      if (block) {
        destroy(block);
        return true;
      }
      return false;
    },

    /**
     * Move a block within this column
     */
    moveBlock(fromIndex: number, toIndex: number) {
      if (fromIndex < 0 || fromIndex >= self.blocks.length) return false;
      if (toIndex < 0 || toIndex > self.blocks.length) return false;
      if (fromIndex === toIndex) return false;

      const [block] = self.blocks.splice(fromIndex, 1);
      // Adjust toIndex if we're moving down (because we removed an item above)
      const adjustedToIndex = toIndex > fromIndex ? toIndex - 1 : toIndex;
      self.blocks.splice(adjustedToIndex, 0, block);
      return true;
    },

    /**
     * Detach a block (remove without destroying, for moving to another column)
     */
    detachBlock(blockId: string): BlockInstance | undefined {
      const block = self.blocks.find(b => b.id === blockId);
      if (block) {
        return detach(block);
      }
      return undefined;
    },

    /**
     * Update column properties
     */
    updateProperties(updates: {
      width?: number;
      backgroundColor?: string;
      verticalAlign?: 'top' | 'middle' | 'bottom';
      paddingTop?: string;
      paddingRight?: string;
      paddingBottom?: string;
      paddingLeft?: string;
    }) {
      Object.entries(updates).forEach(([key, value]) => {
        if (key in self) {
          (self as any)[key] = value;
        }
      });
    },

    /**
     * Set padding
     */
    setPadding(padding: { top?: string; right?: string; bottom?: string; left?: string }) {
      if (padding.top !== undefined) self.paddingTop = padding.top;
      if (padding.right !== undefined) self.paddingRight = padding.right;
      if (padding.bottom !== undefined) self.paddingBottom = padding.bottom;
      if (padding.left !== undefined) self.paddingLeft = padding.left;
    },

    /**
     * Toggle column visibility
     */
    toggleHidden() {
      self.hidden = !self.hidden;
    },

    /**
     * Set column width
     */
    setWidth(width: number) {
      self.width = Math.max(0, Math.min(100, width));
    },

    /**
     * Clear all blocks
     */
    clearBlocks() {
      self.blocks.forEach(block => destroy(block));
      self.blocks.clear();
    },
  }))
  .views(self => ({
    /**
     * Find a block by ID
     */
    getBlockById(blockId: string): BlockInstance | undefined {
      return self.blocks.find(b => b.id === blockId);
    },

    /**
     * Get block index
     */
    getBlockIndex(blockId: string): number {
      return self.blocks.findIndex(b => b.id === blockId);
    },

    /**
     * Get visible blocks only
     */
    get visibleBlocks(): BlockInstance[] {
      return self.blocks.filter(b => !b.hidden);
    },

    /**
     * Count of blocks
     */
    get blockCount(): number {
      return self.blocks.length;
    },

    /**
     * Check if column is empty
     */
    get isEmpty(): boolean {
      return self.blocks.length === 0;
    },

    /**
     * Get padding as object
     */
    get padding(): { top?: string; right?: string; bottom?: string; left?: string } {
      return {
        top: self.paddingTop || undefined,
        right: self.paddingRight || undefined,
        bottom: self.paddingBottom || undefined,
        left: self.paddingLeft || undefined,
      };
    },

    /**
     * Get padding as CSS string
     */
    get paddingString(): string | undefined {
      const { paddingTop, paddingRight, paddingBottom, paddingLeft } = self;
      if (!paddingTop && !paddingRight && !paddingBottom && !paddingLeft) {
        return undefined;
      }
      return `${paddingTop || '0'} ${paddingRight || '0'} ${paddingBottom || '0'} ${paddingLeft || '0'}`;
    },

    /**
     * Computed style for rendering
     */
    get computedStyle(): CSSProperties {
      const style: CSSProperties = {
        width: `${self.width}%`,
      };

      if (self.backgroundColor) style.backgroundColor = self.backgroundColor;
      if (self.verticalAlign) style.verticalAlign = self.verticalAlign as CSSProperties['verticalAlign'];
      if (self.paddingTop) style.paddingTop = self.paddingTop;
      if (self.paddingRight) style.paddingRight = self.paddingRight;
      if (self.paddingBottom) style.paddingBottom = self.paddingBottom;
      if (self.paddingLeft) style.paddingLeft = self.paddingLeft;

      return style;
    },

    /**
     * MJML attributes for export
     */
    get mjmlAttributes(): Record<string, string> {
      const attrs: Record<string, string> = {};

      if (self.width !== 100) attrs.width = `${self.width}%`;
      if (self.backgroundColor) attrs['background-color'] = self.backgroundColor;
      if (self.verticalAlign) attrs['vertical-align'] = self.verticalAlign;

      // Padding
      const hasPadding = self.paddingTop || self.paddingRight || self.paddingBottom || self.paddingLeft;
      if (hasPadding) {
        const padding = `${self.paddingTop || '0'} ${self.paddingRight || '0'} ${self.paddingBottom || '0'} ${self.paddingLeft || '0'}`;
        attrs.padding = padding;
      }

      return attrs;
    },
  }));

export type ColumnInstance = Instance<typeof ColumnModel>;
export type ColumnSnapshotIn = SnapshotIn<typeof ColumnModel>;
export type ColumnSnapshotOut = SnapshotOut<typeof ColumnModel>;

/**
 * Factory function to create a new column
 */
export function createColumn(options: {
  id?: string;
  width?: number;
  blocks?: BlockSnapshotIn[];
} = {}): ColumnSnapshotIn {
  return {
    id: options.id || nanoid(),
    width: options.width || 100,
    blocks: options.blocks || [],
  };
}
