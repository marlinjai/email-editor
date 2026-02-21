import { describe, it, expect, beforeEach } from 'vitest';
import { createStandardBlockRegistry } from '../registry';
import type { BlockRegistryImpl } from '@marlinjai/email-editor-core';

const ALL_BLOCK_TYPES = [
  'text',
  'image',
  'button',
  'divider',
  'spacer',
  'social',
  'hero',
  'accordion',
  'raw',
  'navbar',
  'carousel',
  'table',
  'header',
  'footer',
] as const;

describe('createStandardBlockRegistry', () => {
  let registry: ReturnType<typeof createStandardBlockRegistry>;

  beforeEach(() => {
    registry = createStandardBlockRegistry();
  });

  it('creates a registry with 14 block types', () => {
    const all = registry.getAll();
    expect(all).toHaveLength(14);
  });

  it('has all expected block types', () => {
    for (const type of ALL_BLOCK_TYPES) {
      expect(registry.has(type)).toBe(true);
    }
  });

  it('each block definition has required fields', () => {
    const all = registry.getAll();
    for (const def of all) {
      expect(def.type).toBeTruthy();
      expect(def.label).toBeTruthy();
      expect(def.category).toBeTruthy();
      expect(def.defaultProps).toBeDefined();
      expect(def.propSchema).toBeDefined();
      expect(typeof def.toMJML).toBe('function');
    }
  });

  describe('block categories', () => {
    it('text category contains text blocks', () => {
      const textBlocks = registry.getByCategory('text');
      expect(textBlocks.length).toBeGreaterThanOrEqual(1);
      expect(textBlocks.some(b => b.type === 'text')).toBe(true);
    });

    it('media category contains media blocks', () => {
      const mediaBlocks = registry.getByCategory('media');
      expect(mediaBlocks.length).toBeGreaterThanOrEqual(1);
      expect(mediaBlocks.some(b => b.type === 'image')).toBe(true);
    });

    it('brand category contains header and footer', () => {
      const brandBlocks = registry.getByCategory('brand');
      expect(brandBlocks.length).toBeGreaterThanOrEqual(2);
      const types = brandBlocks.map(b => b.type);
      expect(types).toContain('header');
      expect(types).toContain('footer');
    });
  });

  describe('header block definition', () => {
    it('is marked as locked', () => {
      const header = registry.get('header');
      expect(header).toBeDefined();
      expect(header!.locked).toBe(true);
    });

    it('has "brand" category', () => {
      const header = registry.get('header');
      expect(header!.category).toBe('brand');
    });

    it('has a toMJML function that returns MJML', () => {
      const header = registry.get('header');
      const mjml = header!.toMJML({ id: 'test-hdr', type: 'header', locked: true } as any);
      expect(mjml).toContain('mj-wrapper');
    });
  });

  describe('footer block definition', () => {
    it('is marked as locked', () => {
      const footer = registry.get('footer');
      expect(footer).toBeDefined();
      expect(footer!.locked).toBe(true);
    });

    it('has "brand" category', () => {
      const footer = registry.get('footer');
      expect(footer!.category).toBe('brand');
    });

    it('has a toMJML function that returns MJML', () => {
      const footer = registry.get('footer');
      const mjml = footer!.toMJML({ id: 'test-ftr', type: 'footer', locked: true } as any);
      expect(mjml).toContain('mj-wrapper');
    });
  });

  describe('text block definition', () => {
    it('has "text" category', () => {
      const text = registry.get('text');
      expect(text!.category).toBe('text');
    });

    it('has default content', () => {
      const text = registry.get('text');
      expect(text!.defaultProps.content).toBeTruthy();
    });
  });

  describe('image block definition', () => {
    it('has "media" category', () => {
      const image = registry.get('image');
      expect(image!.category).toBe('media');
    });
  });

  describe('toMJML functions', () => {
    it('text block toMJML returns mj-text', () => {
      const text = registry.get('text');
      const mjml = text!.toMJML({ id: 'test', type: 'text', content: 'Hello' } as any);
      expect(mjml).toContain('<mj-text');
      expect(mjml).toContain('Hello');
    });

    it('image block toMJML returns mj-image', () => {
      const image = registry.get('image');
      const mjml = image!.toMJML({ id: 'test', type: 'image', src: 'test.jpg' } as any);
      expect(mjml).toContain('<mj-image');
      expect(mjml).toContain('test.jpg');
    });

    it('button block toMJML returns mj-button', () => {
      const button = registry.get('button');
      const mjml = button!.toMJML({ id: 'test', type: 'button', label: 'Click', href: '#' } as any);
      expect(mjml).toContain('<mj-button');
      expect(mjml).toContain('Click');
    });

    it('divider block toMJML returns mj-divider', () => {
      const divider = registry.get('divider');
      const mjml = divider!.toMJML({ id: 'test', type: 'divider' } as any);
      expect(mjml).toContain('<mj-divider');
    });

    it('spacer block toMJML returns mj-spacer', () => {
      const spacer = registry.get('spacer');
      const mjml = spacer!.toMJML({ id: 'test', type: 'spacer', height: '20px' } as any);
      expect(mjml).toContain('<mj-spacer');
    });
  });
});
