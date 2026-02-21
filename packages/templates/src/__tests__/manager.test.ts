import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TemplateManager } from '../manager';
import type { TemplateStorageAdapter } from '../adapter';
import type { Template, TemplateVersion } from '../types';

function createMockTemplate(overrides?: Partial<Template>): Template {
  return {
    id: 'tpl-1',
    name: 'Test Template',
    description: 'A test template',
    category: 'Marketing',
    tags: ['promo'],
    status: 'draft',
    templateJson: '{"sections":[]}',
    version: 1,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

function createMockAdapter(): TemplateStorageAdapter {
  return {
    createTemplate: vi.fn(),
    getTemplate: vi.fn(),
    listTemplates: vi.fn(),
    updateTemplate: vi.fn(),
    deleteTemplate: vi.fn(),
    duplicateTemplate: vi.fn(),
    archiveTemplate: vi.fn(),
    createVersion: vi.fn(),
    listVersions: vi.fn(),
    restoreVersion: vi.fn(),
  };
}

describe('TemplateManager', () => {
  let adapter: TemplateStorageAdapter;
  let manager: TemplateManager;

  beforeEach(() => {
    adapter = createMockAdapter();
    manager = new TemplateManager({ adapter, autoVersion: true });
  });

  describe('createTemplate', () => {
    it('should create a template with valid input', async () => {
      const template = createMockTemplate();
      vi.mocked(adapter.createTemplate).mockResolvedValue(template);

      const result = await manager.createTemplate({
        name: 'Test Template',
        templateJson: '{"sections":[]}',
      });

      expect(result).toEqual(template);
      expect(adapter.createTemplate).toHaveBeenCalledWith({
        name: 'Test Template',
        templateJson: '{"sections":[]}',
      });
    });

    it('should reject empty name', async () => {
      await expect(
        manager.createTemplate({ name: '', templateJson: '{}' })
      ).rejects.toThrow();
    });

    it('should reject empty templateJson', async () => {
      await expect(
        manager.createTemplate({ name: 'Test', templateJson: '' })
      ).rejects.toThrow();
    });
  });

  describe('updateTemplate', () => {
    it('should auto-create a version when templateJson changes', async () => {
      const existing = createMockTemplate({ version: 3 });
      vi.mocked(adapter.getTemplate).mockResolvedValue(existing);
      vi.mocked(adapter.createVersion).mockResolvedValue({
        id: 'ver-1',
        templateId: 'tpl-1',
        versionNumber: 3,
        templateJson: existing.templateJson,
        createdAt: '2024-01-01T00:00:00Z',
      });
      vi.mocked(adapter.updateTemplate).mockResolvedValue(
        createMockTemplate({ version: 4, templateJson: '{"updated":true}' })
      );

      await manager.updateTemplate('tpl-1', {
        templateJson: '{"updated":true}',
      });

      expect(adapter.createVersion).toHaveBeenCalledWith(
        'tpl-1',
        existing.templateJson,
        'Auto-saved v3'
      );
      expect(adapter.updateTemplate).toHaveBeenCalledWith('tpl-1', {
        templateJson: '{"updated":true}',
      });
    });

    it('should skip versioning when only name changes', async () => {
      vi.mocked(adapter.updateTemplate).mockResolvedValue(
        createMockTemplate({ name: 'Renamed' })
      );

      await manager.updateTemplate('tpl-1', { name: 'Renamed' });

      expect(adapter.createVersion).not.toHaveBeenCalled();
    });

    it('should skip versioning when autoVersion is disabled', async () => {
      manager = new TemplateManager({ adapter, autoVersion: false });
      vi.mocked(adapter.updateTemplate).mockResolvedValue(
        createMockTemplate({ templateJson: '{"new":true}' })
      );

      await manager.updateTemplate('tpl-1', { templateJson: '{"new":true}' });

      expect(adapter.createVersion).not.toHaveBeenCalled();
    });
  });

  describe('duplicateTemplate', () => {
    it('should duplicate with custom name', async () => {
      const original = createMockTemplate();
      vi.mocked(adapter.getTemplate).mockResolvedValue(original);
      vi.mocked(adapter.duplicateTemplate).mockResolvedValue(
        createMockTemplate({ id: 'tpl-2', name: 'Copy of Test' })
      );

      const result = await manager.duplicateTemplate('tpl-1', 'Copy of Test');

      expect(adapter.duplicateTemplate).toHaveBeenCalledWith('tpl-1', 'Copy of Test');
      expect(result.name).toBe('Copy of Test');
    });

    it('should auto-generate name when not provided', async () => {
      const original = createMockTemplate({ name: 'My Template' });
      vi.mocked(adapter.getTemplate).mockResolvedValue(original);
      vi.mocked(adapter.duplicateTemplate).mockResolvedValue(
        createMockTemplate({ id: 'tpl-2', name: 'My Template (copy)' })
      );

      const result = await manager.duplicateTemplate('tpl-1');

      expect(adapter.duplicateTemplate).toHaveBeenCalledWith('tpl-1', 'My Template (copy)');
      expect(result.name).toBe('My Template (copy)');
    });

    it('should throw if template not found', async () => {
      vi.mocked(adapter.getTemplate).mockResolvedValue(null);

      await expect(manager.duplicateTemplate('missing')).rejects.toThrow('not found');
    });
  });

  describe('export/import', () => {
    it('should round-trip a template through export and import', async () => {
      const template = createMockTemplate({
        name: 'Export Test',
        description: 'Desc',
        category: 'Newsletter',
        tags: ['tag1', 'tag2'],
        templateJson: '{"blocks":[1,2,3]}',
        version: 5,
      });

      const exported = manager.exportTemplate(template);
      const parsed = JSON.parse(exported);

      expect(parsed.name).toBe('Export Test');
      expect(parsed.description).toBe('Desc');
      expect(parsed.category).toBe('Newsletter');
      expect(parsed.tags).toEqual(['tag1', 'tag2']);
      expect(parsed.templateJson).toBe('{"blocks":[1,2,3]}');
      expect(parsed.version).toBe(5);
      expect(parsed.exportedAt).toBeDefined();

      vi.mocked(adapter.createTemplate).mockResolvedValue(
        createMockTemplate({ name: 'Export Test' })
      );

      await manager.importTemplate(exported);

      expect(adapter.createTemplate).toHaveBeenCalledWith({
        name: 'Export Test',
        description: 'Desc',
        category: 'Newsletter',
        tags: ['tag1', 'tag2'],
        templateJson: '{"blocks":[1,2,3]}',
      });
    });
  });

  describe('version history', () => {
    it('should list versions', async () => {
      const versions: TemplateVersion[] = [
        {
          id: 'ver-2',
          templateId: 'tpl-1',
          versionNumber: 2,
          templateJson: '{"v":2}',
          createdAt: '2024-01-02T00:00:00Z',
        },
        {
          id: 'ver-1',
          templateId: 'tpl-1',
          versionNumber: 1,
          templateJson: '{"v":1}',
          createdAt: '2024-01-01T00:00:00Z',
        },
      ];
      vi.mocked(adapter.listVersions).mockResolvedValue(versions);

      const result = await manager.listVersions('tpl-1');

      expect(result).toHaveLength(2);
      expect(result[0].versionNumber).toBe(2);
    });

    it('should restore a version', async () => {
      const restored = createMockTemplate({ version: 3, templateJson: '{"v":1}' });
      vi.mocked(adapter.restoreVersion).mockResolvedValue(restored);

      const result = await manager.restoreVersion('tpl-1', 'ver-1');

      expect(adapter.restoreVersion).toHaveBeenCalledWith('tpl-1', 'ver-1');
      expect(result.templateJson).toBe('{"v":1}');
    });
  });

  describe('archiveTemplate', () => {
    it('should delegate to adapter', async () => {
      await manager.archiveTemplate('tpl-1');
      expect(adapter.archiveTemplate).toHaveBeenCalledWith('tpl-1');
    });
  });

  describe('deleteTemplate', () => {
    it('should delegate to adapter', async () => {
      await manager.deleteTemplate('tpl-1');
      expect(adapter.deleteTemplate).toHaveBeenCalledWith('tpl-1');
    });
  });
});
