// packages/core/src/store/mst/models/TemplateModel.ts
import { types, Instance, SnapshotIn, SnapshotOut, destroy, detach, getSnapshot, type IType } from 'mobx-state-tree';
import type { MjmlHead } from '../../../schema/types';
import { CURRENT_TEMPLATE_VERSION, migrateV1_0ToV1_1 } from '../../../schema/migrate';
import { dropFilled, fillDefaults, type Filled } from './filledDefaults';
import { nanoid } from 'nanoid';
import { SectionModel, createSection } from './SectionModel';
import { WrapperModel, createWrapper } from './WrapperModel';
import { BlockModel, BlockType } from './BlockModel';
import type { SectionInstance, SectionSnapshotIn, SectionSnapshotOut } from './SectionModel';
import type { WrapperInstance, WrapperSnapshotIn, WrapperSnapshotOut } from './WrapperModel';
import type { BlockInstance, BlockSnapshotIn } from './BlockModel';
import type { ColumnInstance } from './ColumnModel';

/**
 * One entry of the document's top level: a section, or a wrapper around
 * sections. Dispatched on `type` (a wrapper always carries `type: 'wrapper'`;
 * a section's `type` may be left out).
 */
export const TopLevelItemModel: IType<
  SectionSnapshotIn | WrapperSnapshotIn,
  SectionSnapshotOut | WrapperSnapshotOut,
  SectionInstance | WrapperInstance
> = types.union(
  {
    dispatcher: (snapshot: { type?: string } | undefined) => (snapshot?.type === 'wrapper' ? WrapperModel : SectionModel),
  },
  SectionModel,
  WrapperModel
);

export type TopLevelItemInstance = SectionInstance | WrapperInstance;

/** Whether a top-level item of the store is a wrapper. */
export function isWrapperInstance(item: TopLevelItemInstance | undefined): item is WrapperInstance {
  return item?.type === 'wrapper';
}

/**
 * A section's snapshot with fresh ids for it and everything inside (columns,
 * sub-columns, blocks), for duplicating: ids are identifiers in the store and
 * must not repeat.
 */
export function cloneSectionSnapshot(snapshot: SectionSnapshotIn): SectionSnapshotIn {
  const cloneBlocks = (blocks: unknown[] | undefined) => (blocks ?? []).map((b) => ({ ...(b as object), id: nanoid() }));
  return {
    ...snapshot,
    id: nanoid(),
    columns: (snapshot.columns ?? []).map((col) => ({
      ...col,
      id: nanoid(),
      blocks: cloneBlocks(col.blocks as unknown[]) as never,
      ...(col.subColumns ? { subColumns: col.subColumns.map((sc: { blocks?: unknown }) => ({ ...sc, id: nanoid(), blocks: cloneBlocks(sc.blocks as unknown[]) as never })) } : {}),
    })),
  };
}

/**
 * Font definition for custom fonts
 */
export const FontDefinitionModel = types.model('FontDefinition', {
  name: types.string,
  href: types.string,
});

/**
 * Theme color for reusable brand colors
 */
export const ThemeColorModel = types
  .model('ThemeColor', {
    name: types.string,
    value: types.string,
  })
  .actions(self => ({
    setValue(value: string) {
      self.value = value;
    },
    setName(name: string) {
      self.name = name;
    },
  }));

/**
 * Default theme colors
 */
const DEFAULT_THEME_COLORS = [
  { name: 'Primary', value: '#944923' },
  { name: 'Secondary', value: '#ffffff' },
  { name: 'Text', value: '#333333' },
  { name: 'Background', value: '#f5f5f5' },
];

/** What the metadata model fills when a stored document leaves a field out. */
const METADATA_DEFAULTS: Record<string, () => unknown> = {
  title: () => 'Untitled Template',
  subject: () => '',
  previewText: () => '',
  createdAt: () => Date.now(),
  updatedAt: () => Date.now(),
  fonts: () => [],
  themeColors: () => DEFAULT_THEME_COLORS.map((c) => ({ ...c })),
};

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
    themeColors: types.optional(types.array(ThemeColorModel), DEFAULT_THEME_COLORS),
    breakpoint: types.maybe(types.string),
    customCSS: types.maybe(types.string),
    inlineCSS: types.maybe(types.string),
    /** The MJML head and body settings of an imported document (see `MjmlHead` in the schema). */
    mjmlHead: types.maybe(types.frozen<MjmlHead>()),
    /** Defaults the store filled when it opened the node; they go back out only if changed (see `filledDefaults.ts`). */
    filled: types.maybe(types.frozen<Filled>()),
    /** Dates a stored document wrote as ISO strings, so they go back out as written. */
    dateStrings: types.maybe(types.frozen<Record<string, string>>()),
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

    addThemeColor(name: string, value: string) {
      self.themeColors.push(ThemeColorModel.create({ name, value }));
      self.updatedAt = new Date();
    },

    updateThemeColor(name: string, value: string) {
      const color = self.themeColors.find(c => c.name === name);
      if (color) {
        color.setValue(value);
        self.updatedAt = new Date();
      }
    },

    removeThemeColor(name: string) {
      const index = self.themeColors.findIndex(c => c.name === name);
      if (index !== -1) {
        self.themeColors.splice(index, 1);
        self.updatedAt = new Date();
      }
    },

    touch() {
      self.updatedAt = new Date();
    },
  }))
  // A stored document may carry its dates as ISO strings (a host that set
  // `updatedAt: new Date()` and serialized to JSON writes one). The store keeps
  // dates as `Date`, so parse strings on the way in, remembering how they were
  // written, and drop unparseable ones, letting the default (now) apply,
  // instead of refusing to open the document. Defaults filled here (a title,
  // the dates, the theme colours) are dropped again on the way out unless
  // changed (`filledDefaults.ts`).
  .preProcessSnapshot((snapshot) => {
    if (!snapshot) return snapshot;
    const dateStrings: Record<string, string> = {};
    const toDate = (key: string, value: unknown) => {
      if (typeof value !== 'string') return value;
      const ms = Date.parse(value);
      if (Number.isNaN(ms)) return undefined;
      dateStrings[key] = value;
      return ms;
    };
    const parsed = {
      ...snapshot,
      createdAt: toDate('createdAt', snapshot.createdAt),
      updatedAt: toDate('updatedAt', snapshot.updatedAt),
      ...(Object.keys(dateStrings).length > 0 ? { dateStrings } : {}),
    } as typeof snapshot;
    return fillDefaults(parsed, METADATA_DEFAULTS);
  })
  .postProcessSnapshot((snapshot) => {
    const { dateStrings, ...rest } = dropFilled(snapshot) as typeof snapshot & { dateStrings?: Record<string, string> };
    const out = rest as Record<string, unknown>;
    for (const [key, written] of Object.entries(dateStrings ?? {})) {
      if (out[key] === Date.parse(written)) out[key] = written;
    }
    return out as typeof snapshot;
  });

/**
 * TemplateModel - The root model for an email template
 *
 * `id` is optional on the way in: a host may open a document that has none (the
 * schema and the mail service's contract do not require one). The store then
 * assigns a fresh id once, when the document is loaded, and every snapshot it
 * emits carries that id, so a host that saves what `onChange` hands it keeps the
 * same id from then on. It is a plain string rather than an MST identifier, so
 * `loadTemplate` and `resetTemplate` can replace the document with one that has
 * a different id.
 */
export const TemplateModel = types
  .model('Template', {
    id: types.optional(types.string, () => nanoid()),
    version: types.optional(types.string, CURRENT_TEMPLATE_VERSION),
    metadata: types.optional(TemplateMetadataModel, {}),
    /** The top level, in order: sections and wrappers (see `TopLevelItemModel`). */
    sections: types.array(TopLevelItemModel),
  })
  // A schema 1.0 document opens as 1.1, exactly as `migrateTemplate` takes it
  // there (the version, and a 1.0 `isWrapper` section becomes a wrapper), so
  // what the store emits is always a current document.
  .preProcessSnapshot((snapshot) => {
    if (!snapshot || snapshot.version !== '1.0' || !Array.isArray(snapshot.sections)) return snapshot;
    return migrateV1_0ToV1_1(snapshot as never) as unknown as typeof snapshot;
  })
  .views(self => ({
    /** Every section in document order, the ones inside wrappers included. */
    get allSections(): SectionInstance[] {
      const out: SectionInstance[] = [];
      for (const item of self.sections) {
        if (isWrapperInstance(item)) out.push(...item.sections);
        else out.push(item as SectionInstance);
      }
      return out;
    },

    /** The top-level wrappers, in order. */
    get wrappers(): WrapperInstance[] {
      return self.sections.filter(isWrapperInstance);
    },
  }))
  .views(self => ({
    getSectionById(sectionId: string): SectionInstance | undefined {
      return self.allSections.find(s => s.id === sectionId);
    },

    getWrapperById(wrapperId: string): WrapperInstance | undefined {
      return self.wrappers.find(w => w.id === wrapperId);
    },

    /** The wrapper a section sits in; undefined for a top-level section (or an unknown id). */
    findWrapperBySectionId(sectionId: string): WrapperInstance | undefined {
      return self.wrappers.find(w => w.sections.some(s => s.id === sectionId));
    },

    /** The index of a top-level item (section or wrapper); -1 when it is not at the top level. */
    getSectionIndex(itemId: string): number {
      return self.sections.findIndex(s => s.id === itemId);
    },
  }))
  .actions(self => {
    /** The array a section lives in (the top level or a wrapper's), and its index there. */
    const locate = (sectionId: string): { list: TopLevelItemInstance[] | SectionInstance[]; index: number; wrapper?: WrapperInstance } | undefined => {
      const top = self.sections.findIndex(s => s.id === sectionId && !isWrapperInstance(s));
      if (top !== -1) return { list: self.sections as unknown as TopLevelItemInstance[], index: top };
      for (const wrapper of self.wrappers) {
        const index = wrapper.sections.findIndex(s => s.id === sectionId);
        if (index !== -1) return { list: wrapper.sections as unknown as SectionInstance[], index, wrapper };
      }
      return undefined;
    };

    return {
      /**
       * Add a section at the top level, or into a wrapper when `wrapperId`
       * names one. `index` is the position in that list; the end when left out.
       */
      addSection(section: SectionSnapshotIn, index?: number, wrapperId?: string): SectionInstance {
        const sectionToAdd = SectionModel.create(section);
        const wrapper = wrapperId ? self.getWrapperById(wrapperId) : undefined;
        if (wrapperId && !wrapper) throw new Error(`No wrapper with id "${wrapperId}"`);
        const list = (wrapper ? wrapper.sections : self.sections) as unknown as { length: number; splice: (...a: unknown[]) => void; push: (x: unknown) => void };
        if (index !== undefined && index >= 0 && index <= list.length) list.splice(index, 0, sectionToAdd);
        else list.push(sectionToAdd);
        self.metadata.touch();
        return sectionToAdd;
      },

      /** Add a wrapper at the top level (by default around one empty section). */
      addWrapper(wrapper: WrapperSnapshotIn = createWrapper(), index?: number): WrapperInstance {
        const wrapperToAdd = WrapperModel.create(wrapper);
        if (index !== undefined && index >= 0 && index <= self.sections.length) self.sections.splice(index, 0, wrapperToAdd);
        else self.sections.push(wrapperToAdd);
        self.metadata.touch();
        return wrapperToAdd;
      },

      /** Remove a section, wherever it is (a wrapper that loses its last section stays, empty). */
      removeSection(sectionId: string): boolean {
        const at = locate(sectionId);
        if (!at) return false;
        destroy(at.list[at.index]!);
        self.metadata.touch();
        return true;
      },

      /**
       * Move a top-level item (a section or a wrapper) to another position
       * of the top level.
       */
      moveSection(itemId: string, toIndex: number): boolean {
        const fromIndex = self.sections.findIndex(s => s.id === itemId);
        if (fromIndex === -1 || toIndex < 0 || toIndex >= self.sections.length) return false;
        if (fromIndex === toIndex) return false;

        const item = detach(self.sections[fromIndex]!);
        self.sections.splice(toIndex, 0, item);
        self.metadata.touch();
        return true;
      },

      /**
       * Move a section into a wrapper, out of one, between two, or within one.
       * `wrapperId: null` targets the top level. `index` is the position in
       * the target list as it is after the section left its old place.
       */
      moveSectionTo(sectionId: string, target: { wrapperId: string | null; index: number }): boolean {
        const at = locate(sectionId);
        if (!at) return false;
        const wrapper = target.wrapperId ? self.getWrapperById(target.wrapperId) : undefined;
        if (target.wrapperId && !wrapper) return false;
        const sameList = (at.wrapper?.id ?? null) === (target.wrapperId ?? null);
        if (sameList && at.index === target.index) return false;

        const section = detach(at.list[at.index]!) as SectionInstance;
        const list = (wrapper ? wrapper.sections : self.sections) as unknown as { length: number; splice: (...a: unknown[]) => void };
        const index = Math.max(0, Math.min(target.index, list.length));
        list.splice(index, 0, section);
        self.metadata.touch();
        return true;
      },

      /** Put a top-level section into a new wrapper, in its place. Returns the wrapper. */
      wrapSection(sectionId: string): WrapperInstance | undefined {
        const index = self.sections.findIndex(s => s.id === sectionId && !isWrapperInstance(s));
        if (index === -1) return undefined;
        const section = detach(self.sections[index]!) as SectionInstance;
        const wrapper = WrapperModel.create({ id: nanoid(), type: 'wrapper', sections: [] });
        self.sections.splice(index, 0, wrapper);
        wrapper.sections.push(section);
        self.metadata.touch();
        return wrapper;
      },

      /** Take a wrapper's sections out to the top level, in its place, and remove the wrapper. Returns the sections' ids. */
      unwrap(wrapperId: string): string[] {
        const index = self.sections.findIndex(s => s.id === wrapperId && isWrapperInstance(s));
        if (index === -1) return [];
        const wrapper = self.sections[index] as WrapperInstance;
        const sections = wrapper.sections.slice().map(s => detach(s));
        destroy(wrapper);
        self.sections.splice(index, 0, ...sections);
        self.metadata.touch();
        return sections.map(s => s.id);
      },

      /**
       * Remove a wrapper. With `keepSections`, its sections stay, in its place
       * (the same as {@link unwrap}); otherwise they go with it.
       */
      removeWrapper(wrapperId: string, options: { keepSections: boolean }): boolean {
        const wrapper = self.getWrapperById(wrapperId);
        if (!wrapper) return false;
        if (options.keepSections) {
          this.unwrap(wrapperId);
        } else {
          destroy(wrapper);
          self.metadata.touch();
        }
        return true;
      },

      /** Duplicate a section right after itself, in the same wrapper (or at the top level). */
      duplicateSection(sectionId: string): SectionInstance | undefined {
        const at = locate(sectionId);
        if (!at) return undefined;
        const newSection = SectionModel.create(cloneSectionSnapshot(getSnapshot(at.list[at.index] as SectionInstance)));
        (at.list as unknown as { splice: (...a: unknown[]) => void }).splice(at.index + 1, 0, newSection);
        self.metadata.touch();
        return newSection;
      },

      /** Duplicate a wrapper and everything inside it, right after itself. */
      duplicateWrapper(wrapperId: string): WrapperInstance | undefined {
        const index = self.sections.findIndex(s => s.id === wrapperId && isWrapperInstance(s));
        if (index === -1) return undefined;
        const snapshot = getSnapshot(self.sections[index] as WrapperInstance);
        const copy = WrapperModel.create({
          ...snapshot,
          id: nanoid(),
          sections: snapshot.sections.map(s => cloneSectionSnapshot(s)),
        });
        self.sections.splice(index + 1, 0, copy);
        self.metadata.touch();
        return copy;
      },

      insertBlock(columnId: string, block: BlockSnapshotIn, index?: number): BlockInstance | undefined {
        for (const section of self.allSections) {
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

        for (const section of self.allSections) {
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

        for (const section of self.allSections) {
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
        for (const section of self.allSections) {
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
      }): void {
        self.metadata.update(updates);
      },

      clear(): void {
        self.sections.forEach(s => destroy(s));
        self.sections.clear();
        self.metadata.touch();
      },
    };
  })
  .views(self => ({
    findColumnById(columnId: string): ColumnInstance | undefined {
      for (const section of self.allSections) {
        const column = section.getColumnById(columnId);
        if (column) return column;
      }
      return undefined;
    },

    findBlockById(blockId: string): BlockInstance | undefined {
      for (const section of self.allSections) {
        const block = section.findBlockById(blockId);
        if (block) return block;
      }
      return undefined;
    },

    findSectionByBlockId(blockId: string): SectionInstance | undefined {
      for (const section of self.allSections) {
        if (section.findBlockById(blockId)) {
          return section;
        }
      }
      return undefined;
    },

    findColumnByBlockId(blockId: string): ColumnInstance | undefined {
      for (const section of self.allSections) {
        const column = section.findColumnByBlockId(blockId);
        if (column) return column;
      }
      return undefined;
    },

    /** Visible top-level items (a hidden wrapper hides everything inside it). */
    get visibleSections(): TopLevelItemInstance[] {
      return self.sections.filter(s => !s.hidden);
    },

    /** How many sections the document has, the ones inside wrappers included. */
    get sectionCount(): number {
      return self.allSections.length;
    },

    get totalBlockCount(): number {
      return self.allSections.reduce((sum, section) => sum + section.totalBlockCount, 0);
    },

    get isEmpty(): boolean {
      return self.allSections.every(s => s.isEmpty);
    },

    getBlocksByType(type: BlockType): BlockInstance[] {
      const blocks: BlockInstance[] = [];
      for (const section of self.allSections) {
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

    get allBlocks(): BlockInstance[] {
      const blocks: BlockInstance[] = [];
      for (const section of self.allSections) {
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
  sections?: Array<SectionSnapshotIn | WrapperSnapshotIn>;
} = {}): TemplateSnapshotIn {
  return {
    id: options.id || nanoid(),
    version: CURRENT_TEMPLATE_VERSION,
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
    version: CURRENT_TEMPLATE_VERSION,
    metadata: {
      title: options.title || 'Untitled Template',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    sections: [createSection()],
  };
}
