// packages/core/src/store/mst/models/TemplateModel.ts
import { types, Instance, SnapshotIn, SnapshotOut, destroy, detach, getSnapshot } from 'mobx-state-tree';
import { nanoid } from 'nanoid';
import { SectionModel, createSection } from './SectionModel';
import { BlockModel, BlockType } from './BlockModel';
import type { SectionSnapshotIn } from './SectionModel';
import type { BlockSnapshotIn } from './BlockModel';

/**
 * Font definition for custom fonts
 */
export const FontDefinitionModel = types.model('FontDefinition', {
  name: types.string,
  href: types.string,
});

/**
 * Template metadata
 */
export const TemplateMetadataModel = types
  .model('TemplateMetadata', {
    title: types.optional(types.string, 'Untitled Template'),
    subject: types.optional(types.string, ''),
    previewText: types.optional(types.string, ''),
    createdAt: types.optional(types.Date, () => new Date()),
    updatedAt: types.optional(types.Date, () => new Date()),
    fonts: types.optional(types.array(FontDefinitionModel), []),
    breakpoint: types.maybe(types.string),
    customCSS: types.maybe(types.string),
    inlineCSS: types.maybe(types.string),
  })
  .actions(self => ({
    update(updates: {
      title?: string;
      subject?: string;
      previewText?: string;
      breakpoint?: string;
      customCSS?: string;
      inlineCSS?: string;
    }) {
      Object.entries(updates).forEach(([key, value]) => {
        if (key in self && value !== undefined) {
          (self as any)[key] = value;
        }
      });
      self.updatedAt = new Date();
    },

    addFont(name: string, href: string) {
      self.fonts.push(FontDefinitionModel.create({ name, href }));
      self.updatedAt = new Date();
    },

    removeFont(name: string) {
      const index = self.fonts.findIndex(f => f.name === name);
      if (index !== -1) {
        self.fonts.splice(index, 1);
        self.updatedAt = new Date();
      }
    },

    touch() {
      self.updatedAt = new Date();
    },
  }));

/**
 * TemplateModel - The root model for an email template
 */
export const TemplateModel = types
  .model('Template', {
    id: types.identifier,
    version: types.optional(types.string, '1.0'),
    metadata: types.optional(TemplateMetadataModel, {}),
    sections: types.array(SectionModel),
  })
  .actions(self => ({
    addSection(section: SectionSnapshotIn, index?: number) {
      const sectionToAdd = SectionModel.create(section);
      if (index !== undefined && index >= 0 && index <= self.sections.length) {
        self.sections.splice(index, 0, sectionToAdd);
      } else {
        self.sections.push(sectionToAdd);
      }
      self.metadata.touch();
      return sectionToAdd;
    },

    removeSection(sectionId: string) {
      const section = self.sections.find(s => s.id === sectionId);
      if (section) {
        destroy(section);
        self.metadata.touch();
        return true;
      }
      return false;
    },

    moveSection(sectionId: string, toIndex: number) {
      const fromIndex = self.sections.findIndex(s => s.id === sectionId);
      if (fromIndex === -1 || toIndex < 0 || toIndex >= self.sections.length) return false;
      if (fromIndex === toIndex) return false;

      const [section] = self.sections.splice(fromIndex, 1);
      self.sections.splice(toIndex, 0, section);
      self.metadata.touch();
      return true;
    },

    duplicateSection(sectionId: string) {
      const section = self.sections.find(s => s.id === sectionId);
      if (!section) return undefined;

      const snapshot = getSnapshot(section);
      const newSnapshot: SectionSnapshotIn = {
        ...snapshot,
        id: nanoid(),
        columns: snapshot.columns.map((col) => ({
          ...col,
          id: nanoid(),
          blocks: col.blocks.map((block) => ({
            ...block,
            id: nanoid(),
          })),
        })),
      };

      const index = self.sections.findIndex(s => s.id === sectionId);
      const newSection = SectionModel.create(newSnapshot);
      self.sections.splice(index + 1, 0, newSection);
      self.metadata.touch();
      return newSection;
    },

    insertBlock(columnId: string, block: BlockSnapshotIn, index?: number) {
      for (const section of self.sections) {
        const column = section.getColumnById(columnId);
        if (column) {
          self.metadata.touch();
          const newBlock = BlockModel.create(block);
          if (index !== undefined && index >= 0 && index <= column.blocks.length) {
            column.blocks.splice(index, 0, newBlock);
          } else {
            column.blocks.push(newBlock);
          }
          return newBlock;
        }
      }
      return undefined;
    },

    moveBlock(blockId: string, targetColumnId: string, targetIndex: number): boolean {
      // Find the block and its current location
      let sourceColumn: Instance<typeof import('./ColumnModel').ColumnModel> | undefined;
      let block: Instance<typeof BlockModel> | undefined;

      for (const section of self.sections) {
        const col = section.findColumnByBlockId(blockId);
        if (col) {
          sourceColumn = col;
          block = col.getBlockById(blockId);
          break;
        }
      }

      if (!sourceColumn || !block) return false;

      // Find target column
      let targetColumn: Instance<typeof import('./ColumnModel').ColumnModel> | undefined;

      for (const section of self.sections) {
        const col = section.getColumnById(targetColumnId);
        if (col) {
          targetColumn = col;
          break;
        }
      }

      if (!targetColumn) return false;

      // Same column - just reorder
      if (sourceColumn.id === targetColumn.id) {
        const fromIndex = sourceColumn.getBlockIndex(blockId);
        sourceColumn.moveBlock(fromIndex, targetIndex);
      } else {
        // Different columns - detach and add
        const detachedBlock = sourceColumn.detachBlock(blockId);
        if (detachedBlock) {
          if (targetIndex >= 0 && targetIndex <= targetColumn.blocks.length) {
            targetColumn.blocks.splice(targetIndex, 0, detachedBlock);
          } else {
            targetColumn.blocks.push(detachedBlock);
          }
        }
      }

      self.metadata.touch();
      return true;
    },

    deleteBlock(blockId: string): boolean {
      for (const section of self.sections) {
        for (const column of section.columns) {
          if (column.removeBlock(blockId)) {
            self.metadata.touch();
            return true;
          }
        }
      }
      return false;
    },

    updateMetadata(updates: {
      title?: string;
      subject?: string;
      previewText?: string;
      breakpoint?: string;
      customCSS?: string;
      inlineCSS?: string;
    }) {
      self.metadata.update(updates);
    },

    clear() {
      self.sections.forEach(s => destroy(s));
      self.sections.clear();
      self.metadata.touch();
    },
  }))
  .views(self => ({
    getSectionById(sectionId: string) {
      return self.sections.find(s => s.id === sectionId);
    },

    getSectionIndex(sectionId: string): number {
      return self.sections.findIndex(s => s.id === sectionId);
    },

    findColumnById(columnId: string) {
      for (const section of self.sections) {
        const column = section.getColumnById(columnId);
        if (column) return column;
      }
      return undefined;
    },

    findBlockById(blockId: string) {
      for (const section of self.sections) {
        const block = section.findBlockById(blockId);
        if (block) return block;
      }
      return undefined;
    },

    findSectionByBlockId(blockId: string) {
      for (const section of self.sections) {
        if (section.findBlockById(blockId)) {
          return section;
        }
      }
      return undefined;
    },

    findColumnByBlockId(blockId: string) {
      for (const section of self.sections) {
        const column = section.findColumnByBlockId(blockId);
        if (column) return column;
      }
      return undefined;
    },

    get visibleSections() {
      return self.sections.filter(s => !s.hidden);
    },

    get sectionCount(): number {
      return self.sections.length;
    },

    get totalBlockCount(): number {
      return self.sections.reduce((sum, section) => sum + section.totalBlockCount, 0);
    },

    get isEmpty(): boolean {
      return self.sections.length === 0 || self.sections.every(s => s.isEmpty);
    },

    getBlocksByType(type: BlockType) {
      const blocks: Instance<typeof BlockModel>[] = [];
      for (const section of self.sections) {
        for (const column of section.columns) {
          for (const block of column.blocks) {
            if (block.type === type) {
              blocks.push(block);
            }
          }
        }
      }
      return blocks;
    },

    get allBlocks() {
      const blocks: Instance<typeof BlockModel>[] = [];
      for (const section of self.sections) {
        for (const column of section.columns) {
          blocks.push(...column.blocks);
        }
      }
      return blocks;
    },
  }));

export type TemplateInstance = Instance<typeof TemplateModel>;
export type TemplateSnapshotIn = SnapshotIn<typeof TemplateModel>;
export type TemplateSnapshotOut = SnapshotOut<typeof TemplateModel>;
export type TemplateMetadataInstance = Instance<typeof TemplateMetadataModel>;

export function createTemplate(options: {
  id?: string;
  title?: string;
  sections?: SectionSnapshotIn[];
} = {}): TemplateSnapshotIn {
  return {
    id: options.id || nanoid(),
    version: '1.0',
    metadata: {
      title: options.title || 'Untitled Template',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    sections: options.sections || [],
  };
}

export function createTemplateWithDefaultSection(options: {
  id?: string;
  title?: string;
} = {}): TemplateSnapshotIn {
  return {
    id: options.id || nanoid(),
    version: '1.0',
    metadata: {
      title: options.title || 'Untitled Template',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    sections: [createSection()],
  };
}
