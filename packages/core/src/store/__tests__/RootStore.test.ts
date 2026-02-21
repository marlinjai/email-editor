import { describe, it, expect, beforeEach } from 'vitest';
import { getSnapshot } from 'mobx-state-tree';
import { RootStore, createRootStore, createEmptyStore } from '../mst/RootStore';
import { createTemplate, createTemplateWithDefaultSection } from '../mst/models/TemplateModel';
import { createSection } from '../mst/models/SectionModel';
import { BlockType } from '../mst/models/BlockModel';
import type { RootStoreInstance } from '../mst/RootStore';

describe('createEmptyStore', () => {
  it('creates a store with an empty template', () => {
    const store = createEmptyStore();
    expect(store).toBeDefined();
    expect(store.template).toBeDefined();
    expect(store.template.sections).toHaveLength(0);
  });

  it('has editorUI with default values', () => {
    const store = createEmptyStore();
    expect(store.editorUI.activeTab).toBe('elements');
    expect(store.editorUI.previewDevice).toBe('desktop');
    expect(store.editorUI.showLeftPanel).toBe(true);
    expect(store.editorUI.showRightPanel).toBe(true);
    expect(store.editorUI.zoomLevel).toBe(1);
  });
});

describe('createRootStore', () => {
  it('creates a store with default template (1 section)', () => {
    const store = createRootStore();
    expect(store.template.sections.length).toBeGreaterThanOrEqual(1);
  });

  it('creates a store with provided template snapshot', () => {
    const templateData = createTemplate({
      title: 'Test Template',
      sections: [createSection({ columnCount: 2 })],
    });
    const store = createRootStore({ template: templateData });
    expect(store.template.metadata.title).toBe('Test Template');
    expect(store.template.sections).toHaveLength(1);
    expect(store.template.sections[0].columns).toHaveLength(2);
  });

  it('initializes history', () => {
    const store = createRootStore();
    expect(store.historyInfo.total).toBeGreaterThanOrEqual(1);
    expect(store.historyInfo.current).toBe(1);
  });
});

describe('Template section operations', () => {
  let store: RootStoreInstance;

  beforeEach(() => {
    store = createRootStore({
      template: createTemplate({ sections: [createSection()] }),
    });
  });

  it('adds a section', () => {
    const section = createSection({ columnCount: 2 });
    store.template.addSection(section);
    expect(store.template.sections).toHaveLength(2);
  });

  it('adds a section at specific index', () => {
    const section2 = createSection({ backgroundColor: '#ff0000' });
    store.template.addSection(section2, 0);
    expect(store.template.sections[0].backgroundColor).toBe('#ff0000');
    expect(store.template.sections).toHaveLength(2);
  });

  it('removes a section', () => {
    const sectionId = store.template.sections[0].id;
    store.template.removeSection(sectionId);
    expect(store.template.sections).toHaveLength(0);
  });

  it('returns false when removing non-existent section', () => {
    expect(store.template.removeSection('nonexistent')).toBe(false);
  });

  it('duplicates a section', () => {
    const sectionId = store.template.sections[0].id;
    const dup = store.template.duplicateSection(sectionId);
    expect(dup).toBeDefined();
    expect(store.template.sections).toHaveLength(2);
    expect(dup!.id).not.toBe(sectionId);
  });

  it('moves a section', () => {
    const sec = createSection({ id: 'move-target', backgroundColor: '#00ff00' });
    store.template.addSection(sec);
    expect(store.template.sections).toHaveLength(2);
    const result = store.template.moveSection('move-target', 0);
    expect(result).toBe(true);
  });
});

describe('Template block operations', () => {
  let store: RootStoreInstance;

  beforeEach(() => {
    store = createRootStore({
      template: createTemplate({ sections: [createSection()] }),
    });
  });

  it('inserts a block into a column', () => {
    const columnId = store.template.sections[0].columns[0].id;
    store.template.insertBlock(columnId, {
      id: 'text-1',
      type: BlockType.TEXT,
      content: 'Hello',
    });
    expect(store.template.sections[0].columns[0].blocks).toHaveLength(1);
    expect(store.template.sections[0].columns[0].blocks[0].content).toBe('Hello');
  });

  it('deletes a block', () => {
    const columnId = store.template.sections[0].columns[0].id;
    store.template.insertBlock(columnId, {
      id: 'text-del',
      type: BlockType.TEXT,
      content: 'To be deleted',
    });
    expect(store.template.deleteBlock('text-del')).toBe(true);
    expect(store.template.sections[0].columns[0].blocks).toHaveLength(0);
  });

  it('returns false when deleting non-existent block', () => {
    expect(store.template.deleteBlock('nonexistent')).toBe(false);
  });

  it('finds a block by ID', () => {
    const columnId = store.template.sections[0].columns[0].id;
    store.template.insertBlock(columnId, {
      id: 'find-me',
      type: BlockType.IMAGE,
      src: 'test.jpg',
    });
    const found = store.template.findBlockById('find-me');
    expect(found).toBeDefined();
    expect(found!.type).toBe(BlockType.IMAGE);
  });

  it('returns undefined for unknown block ID', () => {
    expect(store.template.findBlockById('nope')).toBeUndefined();
  });
});

describe('EditorUI selection state', () => {
  let store: RootStoreInstance;

  beforeEach(() => {
    store = createRootStore();
  });

  it('selects a block and clears other selections', () => {
    store.editorUI.selectBlock('block-1');
    expect(store.editorUI.selectedBlockId).toBe('block-1');
    expect(store.editorUI.selectedSectionId).toBeUndefined();
    expect(store.editorUI.selectedColumnId).toBeUndefined();
    expect(store.editorUI.selectionType).toBe('block');
    expect(store.editorUI.hasSelection).toBe(true);
  });

  it('selects a section and clears other selections', () => {
    store.editorUI.selectBlock('block-1');
    store.editorUI.selectSection('sec-1');
    expect(store.editorUI.selectedSectionId).toBe('sec-1');
    expect(store.editorUI.selectedBlockId).toBeUndefined();
    expect(store.editorUI.selectionType).toBe('section');
  });

  it('selects a column and clears other selections', () => {
    store.editorUI.selectColumn('col-1');
    expect(store.editorUI.selectedColumnId).toBe('col-1');
    expect(store.editorUI.selectedBlockId).toBeUndefined();
    expect(store.editorUI.selectedSectionId).toBeUndefined();
    expect(store.editorUI.selectionType).toBe('column');
  });

  it('clears all selection', () => {
    store.editorUI.selectBlock('block-1');
    store.editorUI.clearSelection();
    expect(store.editorUI.hasSelection).toBe(false);
    expect(store.editorUI.selectionType).toBeNull();
  });
});

describe('Block displayName view', () => {
  let store: RootStoreInstance;

  beforeEach(() => {
    store = createRootStore({
      template: createTemplate({ sections: [createSection()] }),
    });
  });

  it('returns truncated text content for text blocks', () => {
    const columnId = store.template.sections[0].columns[0].id;
    store.template.insertBlock(columnId, {
      id: 'txt-name',
      type: BlockType.TEXT,
      content: '<p>This is a very long text that should be truncated in display</p>',
    });
    const block = store.template.findBlockById('txt-name')!;
    expect(block.displayName).toBe('This is a very long ...');
  });

  it('returns "Text" for empty text blocks', () => {
    const columnId = store.template.sections[0].columns[0].id;
    store.template.insertBlock(columnId, {
      id: 'txt-empty',
      type: BlockType.TEXT,
      content: '',
    });
    const block = store.template.findBlockById('txt-empty')!;
    expect(block.displayName).toBe('Text');
  });

  it('returns "Image" for image block without alt', () => {
    const columnId = store.template.sections[0].columns[0].id;
    store.template.insertBlock(columnId, {
      id: 'img-name',
      type: BlockType.IMAGE,
      src: 'test.jpg',
    });
    const block = store.template.findBlockById('img-name')!;
    expect(block.displayName).toBe('Image');
  });

  it('returns alt text for image block with alt', () => {
    const columnId = store.template.sections[0].columns[0].id;
    store.template.insertBlock(columnId, {
      id: 'img-alt',
      type: BlockType.IMAGE,
      src: 'test.jpg',
      alt: 'Product Photo',
    });
    const block = store.template.findBlockById('img-alt')!;
    expect(block.displayName).toBe('Product Photo');
  });

  it('returns "Divider" for divider blocks', () => {
    const columnId = store.template.sections[0].columns[0].id;
    store.template.insertBlock(columnId, {
      id: 'div-name',
      type: BlockType.DIVIDER,
    });
    const block = store.template.findBlockById('div-name')!;
    expect(block.displayName).toBe('Divider');
  });

  it('returns "Header" for header blocks', () => {
    const columnId = store.template.sections[0].columns[0].id;
    store.template.insertBlock(columnId, {
      id: 'hdr-name',
      type: BlockType.HEADER,
      locked: true,
    });
    const block = store.template.findBlockById('hdr-name')!;
    expect(block.displayName).toBe('Header');
  });

  it('returns "Footer" for footer blocks', () => {
    const columnId = store.template.sections[0].columns[0].id;
    store.template.insertBlock(columnId, {
      id: 'ftr-name',
      type: BlockType.FOOTER,
      locked: true,
    });
    const block = store.template.findBlockById('ftr-name')!;
    expect(block.displayName).toBe('Footer');
  });
});

describe('Block isLocked view', () => {
  let store: RootStoreInstance;

  beforeEach(() => {
    store = createRootStore({
      template: createTemplate({ sections: [createSection()] }),
    });
  });

  it('returns true for header blocks', () => {
    const columnId = store.template.sections[0].columns[0].id;
    store.template.insertBlock(columnId, {
      id: 'hdr-lock',
      type: BlockType.HEADER,
      locked: true,
    });
    const block = store.template.findBlockById('hdr-lock')!;
    expect(block.isLocked).toBe(true);
  });

  it('returns true for footer blocks', () => {
    const columnId = store.template.sections[0].columns[0].id;
    store.template.insertBlock(columnId, {
      id: 'ftr-lock',
      type: BlockType.FOOTER,
      locked: true,
    });
    const block = store.template.findBlockById('ftr-lock')!;
    expect(block.isLocked).toBe(true);
  });

  it('returns false for regular text blocks', () => {
    const columnId = store.template.sections[0].columns[0].id;
    store.template.insertBlock(columnId, {
      id: 'txt-lock',
      type: BlockType.TEXT,
      content: 'hi',
    });
    const block = store.template.findBlockById('txt-lock')!;
    expect(block.isLocked).toBe(false);
  });
});

describe('Section displayName view', () => {
  it('returns "Full Width Section" for 1-column section', () => {
    const store = createRootStore({
      template: createTemplate({ sections: [createSection({ columnCount: 1 })] }),
    });
    expect(store.template.sections[0].displayName).toBe('Full Width Section');
  });

  it('returns "2-Column Section" for 2-column section', () => {
    const store = createRootStore({
      template: createTemplate({ sections: [createSection({ columnCount: 2 })] }),
    });
    expect(store.template.sections[0].displayName).toBe('2-Column Section');
  });

  it('returns "3-Column Section" for 3-column section', () => {
    const store = createRootStore({
      template: createTemplate({ sections: [createSection({ columnCount: 3 })] }),
    });
    expect(store.template.sections[0].displayName).toBe('3-Column Section');
  });
});

describe('RootStore history', () => {
  it('starts with canUndo false and canRedo false', () => {
    const store = createRootStore();
    expect(store.canUndo).toBe(false);
    expect(store.canRedo).toBe(false);
  });
});

describe('RootStore selected views', () => {
  it('selectedBlock returns the block when selected', () => {
    const store = createRootStore({
      template: createTemplate({ sections: [createSection()] }),
    });
    const columnId = store.template.sections[0].columns[0].id;
    store.template.insertBlock(columnId, {
      id: 'sel-block',
      type: BlockType.TEXT,
      content: 'selected',
    });
    store.editorUI.selectBlock('sel-block');
    expect(store.selectedBlock).toBeDefined();
    expect(store.selectedBlock!.id).toBe('sel-block');
  });

  it('selectedBlock returns undefined when nothing selected', () => {
    const store = createRootStore();
    expect(store.selectedBlock).toBeUndefined();
  });

  it('selectedSection returns the section when selected', () => {
    const store = createRootStore({
      template: createTemplate({ sections: [createSection()] }),
    });
    const sectionId = store.template.sections[0].id;
    store.editorUI.selectSection(sectionId);
    expect(store.selectedSection).toBeDefined();
    expect(store.selectedSection!.id).toBe(sectionId);
  });
});
