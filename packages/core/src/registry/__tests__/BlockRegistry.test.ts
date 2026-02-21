import { describe, it, expect, beforeEach } from 'vitest';
import { BlockRegistryImpl, createBlockRegistry } from '../BlockRegistry';
import type { BlockDefinition } from '../types';
import type { TextBlock, ImageBlock } from '../../schema/types';
import { TextBlockSchema, ImageBlockSchema } from '../../schema/validation';

function makeTextDef(overrides?: Partial<BlockDefinition<TextBlock>>): BlockDefinition<TextBlock> {
  return {
    type: 'text',
    label: 'Text',
    category: 'text',
    defaultProps: { content: '<p>Hello</p>' },
    propSchema: TextBlockSchema.omit({ id: true, type: true }),
    toMJML: (block) => `<mj-text>${block.content}</mj-text>`,
    ...overrides,
  };
}

function makeImageDef(overrides?: Partial<BlockDefinition<ImageBlock>>): BlockDefinition<ImageBlock> {
  return {
    type: 'image',
    label: 'Image',
    category: 'media',
    defaultProps: { src: 'placeholder.jpg' },
    propSchema: ImageBlockSchema.omit({ id: true, type: true }),
    toMJML: (block) => `<mj-image src="${block.src}" />`,
    ...overrides,
  };
}

describe('BlockRegistryImpl', () => {
  let registry: BlockRegistryImpl;

  beforeEach(() => {
    registry = new BlockRegistryImpl();
  });

  describe('register and get', () => {
    it('registers and retrieves a block definition', () => {
      const def = makeTextDef();
      registry.register(def);
      const retrieved = registry.get('text');
      expect(retrieved).toBeDefined();
      expect(retrieved!.type).toBe('text');
      expect(retrieved!.label).toBe('Text');
    });

    it('returns undefined for unknown type', () => {
      expect(registry.get('nonexistent')).toBeUndefined();
    });

    it('overwrites existing registration with same type', () => {
      registry.register(makeTextDef({ label: 'Text V1' }));
      registry.register(makeTextDef({ label: 'Text V2' }));
      expect(registry.get('text')!.label).toBe('Text V2');
    });
  });

  describe('has', () => {
    it('returns true for registered type', () => {
      registry.register(makeTextDef());
      expect(registry.has('text')).toBe(true);
    });

    it('returns false for unregistered type', () => {
      expect(registry.has('text')).toBe(false);
    });
  });

  describe('getAll', () => {
    it('returns empty array when no blocks registered', () => {
      expect(registry.getAll()).toEqual([]);
    });

    it('returns all registered definitions', () => {
      registry.register(makeTextDef());
      registry.register(makeImageDef());
      const all = registry.getAll();
      expect(all).toHaveLength(2);
      const types = all.map(d => d.type);
      expect(types).toContain('text');
      expect(types).toContain('image');
    });
  });

  describe('getByCategory', () => {
    it('returns blocks filtered by category', () => {
      registry.register(makeTextDef());
      registry.register(makeImageDef());

      const textBlocks = registry.getByCategory('text');
      expect(textBlocks).toHaveLength(1);
      expect(textBlocks[0].type).toBe('text');

      const mediaBlocks = registry.getByCategory('media');
      expect(mediaBlocks).toHaveLength(1);
      expect(mediaBlocks[0].type).toBe('image');
    });

    it('returns empty array for category with no blocks', () => {
      registry.register(makeTextDef());
      expect(registry.getByCategory('layout')).toEqual([]);
    });
  });

  describe('unregister', () => {
    it('removes a registered block', () => {
      registry.register(makeTextDef());
      expect(registry.has('text')).toBe(true);
      registry.unregister('text');
      expect(registry.has('text')).toBe(false);
      expect(registry.get('text')).toBeUndefined();
    });

    it('does not throw for unregistering unknown type', () => {
      expect(() => registry.unregister('unknown')).not.toThrow();
    });
  });
});

describe('createBlockRegistry', () => {
  it('returns a new BlockRegistryImpl instance', () => {
    const registry = createBlockRegistry();
    expect(registry).toBeInstanceOf(BlockRegistryImpl);
  });

  it('returns an empty registry', () => {
    const registry = createBlockRegistry();
    expect(registry.getAll()).toEqual([]);
  });
});
