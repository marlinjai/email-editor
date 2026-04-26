// packages/core/src/store/mst/models/SubColumnModel.ts
import { types, Instance, SnapshotIn, SnapshotOut, destroy, detach, isStateTreeNode } from 'mobx-state-tree';
import { nanoid } from 'nanoid';
import { BlockModel, BlockInstance, BlockSnapshotIn } from './BlockModel';
import { isLeafBlockType } from '../../../registry/blockCategories';
import type { CSSProperties } from '../types';
import type { BackgroundGradient } from '../../../schema/gradient';
import { buildGradientCSS } from '../../../schema/gradient';

/**
 * SubColumnModel - one cell in a column that has been split into 2-4
 * side-by-side sub-columns. Holds only LEAF blocks. Cannot contain
 * further sub-columns (no nesting beyond depth 2).
 */
export const SubColumnModel = types
  .model('SubColumn', {
    id: types.identifier,
    width: types.optional(types.number, 50),
    backgroundColor: types.maybe(types.string),
    backgroundGradient: types.maybe(types.frozen<BackgroundGradient>()),
    verticalAlign: types.maybe(types.enumeration(['top', 'middle', 'bottom'])),
    paddingTop: types.maybe(types.string),
    paddingRight: types.maybe(types.string),
    paddingBottom: types.maybe(types.string),
    paddingLeft: types.maybe(types.string),
    blocks: types.array(BlockModel),
  })
  .actions(self => ({
    addBlock(block: BlockSnapshotIn | BlockInstance, index?: number) {
      const type = (block as any).type;
      if (!isLeafBlockType(type)) {
        throw new Error(`SubColumn only accepts leaf blocks; got "${type}"`);
      }
      const blockToAdd = isStateTreeNode(block)
        ? detach(block as BlockInstance)
        : BlockModel.create(block as BlockSnapshotIn);
      if (index !== undefined && index >= 0 && index <= self.blocks.length) {
        self.blocks.splice(index, 0, blockToAdd);
      } else {
        self.blocks.push(blockToAdd);
      }
      return blockToAdd;
    },
    removeBlock(blockId: string) {
      const block = self.blocks.find(b => b.id === blockId);
      if (block) {
        destroy(block);
        return true;
      }
      return false;
    },
    moveBlock(fromIndex: number, toIndex: number) {
      if (fromIndex < 0 || fromIndex >= self.blocks.length) return false;
      if (toIndex < 0 || toIndex > self.blocks.length) return false;
      if (fromIndex === toIndex) return false;
      const [block] = self.blocks.splice(fromIndex, 1);
      const adj = toIndex > fromIndex ? toIndex - 1 : toIndex;
      self.blocks.splice(adj, 0, block);
      return true;
    },
    detachBlock(blockId: string): BlockInstance | undefined {
      const block = self.blocks.find(b => b.id === blockId);
      return block ? detach(block) : undefined;
    },
    setWidth(width: number) {
      self.width = Math.max(0, Math.min(100, width));
    },
    setPadding(p: { top?: string; right?: string; bottom?: string; left?: string }) {
      if (p.top !== undefined) self.paddingTop = p.top;
      if (p.right !== undefined) self.paddingRight = p.right;
      if (p.bottom !== undefined) self.paddingBottom = p.bottom;
      if (p.left !== undefined) self.paddingLeft = p.left;
    },
    updateProperties(updates: Partial<{
      width: number;
      backgroundColor: string;
      backgroundGradient: BackgroundGradient;
      verticalAlign: 'top' | 'middle' | 'bottom';
      paddingTop: string;
      paddingRight: string;
      paddingBottom: string;
      paddingLeft: string;
    }>) {
      Object.entries(updates).forEach(([k, v]) => {
        if (k in self) (self as any)[k] = v;
      });
    },
    clearBlocks() {
      self.blocks.forEach(b => destroy(b));
      self.blocks.clear();
    },
  }))
  .views(self => ({
    get isEmpty(): boolean {
      return self.blocks.length === 0;
    },
    get computedStyle(): CSSProperties {
      const style: CSSProperties = { width: `${self.width}%` };
      if (self.backgroundGradient) {
        const css = buildGradientCSS(self.backgroundGradient);
        if (css) style.backgroundImage = css;
      }
      if (self.backgroundColor) style.backgroundColor = self.backgroundColor;
      if (self.verticalAlign) style.verticalAlign = self.verticalAlign as any;
      if (self.paddingTop) style.paddingTop = self.paddingTop;
      if (self.paddingRight) style.paddingRight = self.paddingRight;
      if (self.paddingBottom) style.paddingBottom = self.paddingBottom;
      if (self.paddingLeft) style.paddingLeft = self.paddingLeft;
      return style;
    },
  }));

export type SubColumnInstance = Instance<typeof SubColumnModel>;
export type SubColumnSnapshotIn = SnapshotIn<typeof SubColumnModel>;
export type SubColumnSnapshotOut = SnapshotOut<typeof SubColumnModel>;

export function createSubColumn(opts: {
  id?: string;
  width?: number;
  blocks?: BlockSnapshotIn[];
} = {}): SubColumnSnapshotIn {
  return {
    id: opts.id ?? nanoid(),
    width: opts.width ?? 50,
    blocks: opts.blocks ?? [],
  };
}
