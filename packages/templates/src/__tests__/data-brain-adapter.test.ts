import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DataBrainTemplateAdapter } from '../data-brain-adapter';

function createMockClient() {
  return {
    createRow: vi.fn(),
    getRow: vi.fn(),
    getRows: vi.fn(),
    updateRow: vi.fn(),
    deleteRow: vi.fn(),
  };
}

function makeRow(id: string, cells: Record<string, unknown>) {
  return {
    id,
    tableId: 'tbl-1',
    cells,
    archived: false,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-02'),
  };
}

describe('DataBrainTemplateAdapter', () => {
  let client: ReturnType<typeof createMockClient>;
  let adapter: DataBrainTemplateAdapter;

  beforeEach(() => {
    client = createMockClient();
    adapter = new DataBrainTemplateAdapter({
      client: client as any,
      templatesTableId: 'tbl-templates',
      versionsTableId: 'tbl-versions',
    });
  });

  describe('createTemplate', () => {
    it('should create a row in the templates table', async () => {
      const row = makeRow('row-1', {
        name: 'New',
        description: null,
        category: null,
        tags: [],
        status: 'draft',
        template_json: '{}',
        thumbnail_file_id: null,
        version: 1,
      });
      client.createRow.mockResolvedValue(row);

      const result = await adapter.createTemplate({
        name: 'New',
        templateJson: '{}',
      });

      expect(client.createRow).toHaveBeenCalledWith({
        tableId: 'tbl-templates',
        cells: {
          name: 'New',
          description: null,
          category: null,
          tags: [],
          status: 'draft',
          template_json: '{}',
          thumbnail_file_id: null,
          version: 1,
        },
      });
      expect(result.id).toBe('row-1');
      expect(result.name).toBe('New');
      expect(result.status).toBe('draft');
    });
  });

  describe('getTemplate', () => {
    it('should return null when not found', async () => {
      client.getRow.mockResolvedValue(null);
      const result = await adapter.getTemplate('missing');
      expect(result).toBeNull();
    });

    it('should map row to template', async () => {
      const row = makeRow('tpl-1', {
        name: 'Found',
        description: 'desc',
        category: 'Marketing',
        tags: ['tag1'],
        status: 'active',
        template_json: '{"data":1}',
        thumbnail_file_id: 'file-1',
        version: 3,
      });
      client.getRow.mockResolvedValue(row);

      const result = await adapter.getTemplate('tpl-1');
      expect(result).not.toBeNull();
      expect(result!.name).toBe('Found');
      expect(result!.category).toBe('Marketing');
      expect(result!.tags).toEqual(['tag1']);
      expect(result!.version).toBe(3);
    });
  });

  describe('listTemplates', () => {
    it('should pass filter parameters to getRows', async () => {
      client.getRows.mockResolvedValue({ items: [], total: 0, hasMore: false });

      await adapter.listTemplates({
        status: 'active',
        category: 'Newsletter',
        search: 'welcome',
        page: 2,
        pageSize: 10,
      });

      expect(client.getRows).toHaveBeenCalledWith('tbl-templates', {
        limit: 10,
        offset: 10,
        filters: [
          { columnId: 'status', operator: 'equals', value: 'active' },
          { columnId: 'category', operator: 'equals', value: 'Newsletter' },
          { columnId: 'name', operator: 'contains', value: 'welcome' },
        ],
        sorts: [{ columnId: 'updatedAt', direction: 'desc' }],
      });
    });
  });

  describe('updateTemplate', () => {
    it('should bump version when templateJson is updated', async () => {
      const existing = makeRow('tpl-1', {
        name: 'Test',
        status: 'draft',
        template_json: '{"old":true}',
        version: 2,
        tags: [],
      });
      client.getRow.mockResolvedValue(existing);
      client.updateRow.mockResolvedValue(
        makeRow('tpl-1', { ...existing.cells, version: 3, template_json: '{"new":true}' })
      );

      const result = await adapter.updateTemplate('tpl-1', {
        templateJson: '{"new":true}',
      });

      expect(client.updateRow).toHaveBeenCalledWith('tpl-1', {
        template_json: '{"new":true}',
        version: 3,
      });
      expect(result.version).toBe(3);
    });
  });

  describe('duplicateTemplate', () => {
    it('should create a new template from existing', async () => {
      const original = makeRow('tpl-1', {
        name: 'Original',
        description: 'desc',
        category: 'Marketing',
        tags: ['a', 'b'],
        status: 'active',
        template_json: '{"data":1}',
        thumbnail_file_id: null,
        version: 5,
      });
      client.getRow.mockResolvedValue(original);
      client.createRow.mockResolvedValue(
        makeRow('tpl-2', { ...original.cells, name: 'Copy', version: 1 })
      );

      const result = await adapter.duplicateTemplate('tpl-1', 'Copy');

      expect(client.createRow).toHaveBeenCalledWith({
        tableId: 'tbl-templates',
        cells: expect.objectContaining({ name: 'Copy' }),
      });
      expect(result.name).toBe('Copy');
    });
  });

  describe('version management', () => {
    it('should create version with incremented number', async () => {
      client.getRows.mockResolvedValue({
        items: [
          makeRow('ver-1', { template_id: 'tpl-1', version_number: 1, template_json: '{}' }),
          makeRow('ver-2', { template_id: 'tpl-1', version_number: 2, template_json: '{}' }),
        ],
        total: 2,
        hasMore: false,
      });
      client.createRow.mockResolvedValue(
        makeRow('ver-3', {
          template_id: 'tpl-1',
          version_number: 3,
          template_json: '{"v":3}',
          change_summary: 'update',
        })
      );

      const version = await adapter.createVersion('tpl-1', '{"v":3}', 'update');

      expect(version.versionNumber).toBe(3);
      expect(client.createRow).toHaveBeenCalledWith({
        tableId: 'tbl-versions',
        cells: {
          template_id: 'tpl-1',
          version_number: 3,
          template_json: '{"v":3}',
          change_summary: 'update',
        },
      });
    });

    it('should restore a version by updating the template', async () => {
      const versionRow = makeRow('ver-1', {
        template_id: 'tpl-1',
        version_number: 1,
        template_json: '{"restored":true}',
      });
      client.getRow.mockImplementation(async (id: string) => {
        if (id === 'ver-1') return versionRow;
        return makeRow('tpl-1', {
          name: 'Test',
          status: 'draft',
          template_json: '{"current":true}',
          version: 3,
          tags: [],
        });
      });
      client.updateRow.mockResolvedValue(
        makeRow('tpl-1', {
          name: 'Test',
          status: 'draft',
          template_json: '{"restored":true}',
          version: 4,
          tags: [],
        })
      );

      const result = await adapter.restoreVersion('tpl-1', 'ver-1');

      expect(result.templateJson).toBe('{"restored":true}');
    });

    it('should throw when restoring version from wrong template', async () => {
      const versionRow = makeRow('ver-1', {
        template_id: 'tpl-other',
        version_number: 1,
        template_json: '{}',
      });
      client.getRow.mockResolvedValue(versionRow);

      await expect(
        adapter.restoreVersion('tpl-1', 'ver-1')
      ).rejects.toThrow('does not belong');
    });
  });
});
