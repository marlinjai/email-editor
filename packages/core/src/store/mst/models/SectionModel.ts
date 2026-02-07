// packages/core/src/store/mst/models/SectionModel.ts
import { types, Instance, SnapshotIn, SnapshotOut, destroy, detach } from 'mobx-state-tree';
import { nanoid } from 'nanoid';
import { ColumnModel, ColumnInstance, ColumnSnapshotIn, createColumn } from './ColumnModel';
import { BlockInstance } from './BlockModel';
import type { CSSProperties } from '../types';

/**
 * SectionModel - A section in the email template
 *
 * Sections are the top-level structural elements that contain columns.
 * Each section maps to an <mj-section> in MJML.
 */
export const SectionModel = types
  .model('Section', {
    id: types.identifier,
    type: types.optional(types.literal('section'), 'section'),

    // Background
    backgroundColor: types.maybe(types.string),
    backgroundImage: types.maybe(types.string),
    backgroundPosition: types.maybe(types.string),
    backgroundRepeat: types.maybe(types.enumeration(['repeat', 'no-repeat'])),
    backgroundSize: types.maybe(types.string),

    // Layout
    fullWidth: types.optional(types.boolean, false),
    isWrapper: types.optional(types.boolean, false),
    noStack: types.optional(types.boolean, false), // mj-group behavior

    // Visibility
    hidden: types.optional(types.boolean, false),

    // Padding
    paddingTop: types.maybe(types.string),
    paddingRight: types.maybe(types.string),
    paddingBottom: types.maybe(types.string),
    paddingLeft: types.maybe(types.string),

    // Columns
    columns: types.array(ColumnModel),
  })
  .actions(self => ({
    /**
     * Add a column to this section
     */
    addColumn(column: ColumnSnapshotIn | ColumnInstance, index?: number) {
      const columnToAdd = ColumnModel.is(column) ? detach(column) : ColumnModel.create(column as ColumnSnapshotIn);
      if (index !== undefined && index >= 0 && index <= self.columns.length) {
        self.columns.splice(index, 0, columnToAdd);
      } else {
        self.columns.push(columnToAdd);
      }
      // Rebalance column widths
      this.rebalanceColumnWidths();
      return columnToAdd;
    },

    /**
     * Remove a column by ID
     */
    removeColumn(columnId: string) {
      const column = self.columns.find(c => c.id === columnId);
      if (column && self.columns.length > 1) {
        destroy(column);
        this.rebalanceColumnWidths();
        return true;
      }
      return false;
    },

    /**
     * Set the number of columns (1-4)
     */
    setColumnCount(count: 1 | 2 | 3 | 4) {
      const currentCount = self.columns.length;

      if (count === currentCount) return;

      if (count > currentCount) {
        // Add new empty columns
        for (let i = currentCount; i < count; i++) {
          self.columns.push(ColumnModel.create(createColumn()));
        }
      } else {
        // Move blocks from removed columns to first column, then remove
        const blocksToMove: any[] = [];
        for (let i = count; i < currentCount; i++) {
          const column = self.columns[i];
          column.blocks.forEach(block => {
            blocksToMove.push(detach(block));
          });
        }

        // Remove excess columns
        while (self.columns.length > count) {
          const column = self.columns[self.columns.length - 1];
          destroy(column);
        }

        // Add blocks to first column
        blocksToMove.forEach(block => {
          self.columns[0].blocks.push(block);
        });
      }

      this.rebalanceColumnWidths();
    },

    /**
     * Rebalance column widths to equal distribution
     */
    rebalanceColumnWidths() {
      const columnCount = self.columns.length;
      if (columnCount === 0) return;

      const equalWidth = Math.floor(100 / columnCount);
      self.columns.forEach((column, index) => {
        // Give the last column any remainder to ensure 100% total
        if (index === columnCount - 1) {
          column.setWidth(100 - equalWidth * (columnCount - 1));
        } else {
          column.setWidth(equalWidth);
        }
      });
    },

    /**
     * Update section properties
     */
    updateProperties(updates: {
      backgroundColor?: string;
      backgroundImage?: string;
      backgroundPosition?: string;
      backgroundRepeat?: 'repeat' | 'no-repeat';
      backgroundSize?: string;
      fullWidth?: boolean;
      isWrapper?: boolean;
      noStack?: boolean;
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
     * Toggle section visibility
     */
    toggleHidden() {
      self.hidden = !self.hidden;
    },

    /**
     * Toggle full width
     */
    toggleFullWidth() {
      self.fullWidth = !self.fullWidth;
    },

    /**
     * Toggle no-stack (mj-group)
     */
    toggleNoStack() {
      self.noStack = !self.noStack;
    },

    /**
     * Move a block from one column to another within this section
     */
    moveBlockBetweenColumns(
      blockId: string,
      sourceColumnId: string,
      targetColumnId: string,
      targetIndex: number
    ): boolean {
      const sourceColumn = self.columns.find(c => c.id === sourceColumnId);
      const targetColumn = self.columns.find(c => c.id === targetColumnId);

      if (!sourceColumn || !targetColumn) return false;

      const block = sourceColumn.detachBlock(blockId);
      if (!block) return false;

      targetColumn.addBlock(block, targetIndex);
      return true;
    },
  }))
  .views(self => ({
    /**
     * Find a column by ID
     */
    getColumnById(columnId: string): ColumnInstance | undefined {
      return self.columns.find(c => c.id === columnId);
    },

    /**
     * Find a block by ID (searches all columns)
     */
    findBlockById(blockId: string): BlockInstance | undefined {
      for (const column of self.columns) {
        const block = column.getBlockById(blockId);
        if (block) return block;
      }
      return undefined;
    },

    /**
     * Find which column contains a block
     */
    findColumnByBlockId(blockId: string): ColumnInstance | undefined {
      for (const column of self.columns) {
        if (column.getBlockById(blockId)) {
          return column;
        }
      }
      return undefined;
    },

    /**
     * Get column index
     */
    getColumnIndex(columnId: string): number {
      return self.columns.findIndex(c => c.id === columnId);
    },

    /**
     * Get visible columns
     */
    get visibleColumns(): ColumnInstance[] {
      return self.columns.filter(c => !c.hidden);
    },

    /**
     * Column count
     */
    get columnCount(): number {
      return self.columns.length;
    },

    /**
     * Total block count across all columns
     */
    get totalBlockCount(): number {
      return self.columns.reduce((sum, col) => sum + col.blockCount, 0);
    },

    /**
     * Check if section is empty (all columns are empty)
     */
    get isEmpty(): boolean {
      return self.columns.every(c => c.isEmpty);
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
      const style: CSSProperties = {};

      if (self.backgroundColor) style.backgroundColor = self.backgroundColor;
      if (self.backgroundImage) {
        style.backgroundImage = `url(${self.backgroundImage})`;
        if (self.backgroundPosition) style.backgroundPosition = self.backgroundPosition;
        if (self.backgroundRepeat) style.backgroundRepeat = self.backgroundRepeat;
        if (self.backgroundSize) style.backgroundSize = self.backgroundSize;
      }
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

      if (self.backgroundColor) attrs['background-color'] = self.backgroundColor;
      if (self.backgroundImage) attrs['background-url'] = self.backgroundImage;
      if (self.backgroundPosition) attrs['background-position'] = self.backgroundPosition;
      if (self.backgroundRepeat) attrs['background-repeat'] = self.backgroundRepeat;
      if (self.backgroundSize) attrs['background-size'] = self.backgroundSize;
      if (self.fullWidth) attrs['full-width'] = 'full-width';

      // Padding
      const hasPadding = self.paddingTop || self.paddingRight || self.paddingBottom || self.paddingLeft;
      if (hasPadding) {
        const padding = `${self.paddingTop || '0'} ${self.paddingRight || '0'} ${self.paddingBottom || '0'} ${self.paddingLeft || '0'}`;
        attrs.padding = padding;
      }

      return attrs;
    },

    /**
     * Display name for layers panel
     */
    get displayName(): string {
      const count = self.columns.length;
      if (count === 1) {
        return 'Full Width Section';
      }
      return `${count}-Column Section`;
    },
  }));

export type SectionInstance = Instance<typeof SectionModel>;
export type SectionSnapshotIn = SnapshotIn<typeof SectionModel>;
export type SectionSnapshotOut = SnapshotOut<typeof SectionModel>;

/**
 * Factory function to create a new section
 */
export function createSection(options: {
  id?: string;
  columnCount?: 1 | 2 | 3 | 4;
  backgroundColor?: string;
} = {}): SectionSnapshotIn {
  const columnCount = options.columnCount || 1;
  const columnWidth = Math.floor(100 / columnCount);

  const columns: ColumnSnapshotIn[] = [];
  for (let i = 0; i < columnCount; i++) {
    columns.push(createColumn({
      width: i === columnCount - 1 ? 100 - columnWidth * (columnCount - 1) : columnWidth,
    }));
  }

  return {
    id: options.id || nanoid(),
    type: 'section',
    backgroundColor: options.backgroundColor,
    columns,
  };
}
