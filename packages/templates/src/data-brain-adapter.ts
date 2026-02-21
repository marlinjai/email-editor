import type { DataBrain } from '@marlinjai/data-brain-sdk';
import type { TemplateStorageAdapter } from './adapter';
import type {
  Template,
  TemplateVersion,
  CreateTemplateInput,
  UpdateTemplateInput,
  TemplateListOptions,
} from './types';

interface DataBrainAdapterConfig {
  client: DataBrain;
  templatesTableId: string;
  versionsTableId: string;
}

/**
 * Maps a Data Brain row to a Template object.
 */
function rowToTemplate(row: {
  id: string;
  cells: Record<string, unknown>;
  createdAt: Date | string;
  updatedAt: Date | string;
}): Template {
  const c = row.cells;
  return {
    id: row.id,
    name: (c.name as string) ?? '',
    description: (c.description as string) ?? undefined,
    category: (c.category as string) ?? undefined,
    tags: Array.isArray(c.tags) ? (c.tags as string[]) : [],
    status: ((c.status as string) ?? 'draft') as Template['status'],
    templateJson: (c.template_json as string) ?? '{}',
    thumbnailFileId: (c.thumbnail_file_id as string) ?? undefined,
    version: (c.version as number) ?? 1,
    createdAt: String(row.createdAt),
    updatedAt: String(row.updatedAt),
  };
}

function rowToVersion(row: {
  id: string;
  cells: Record<string, unknown>;
  createdAt: Date | string;
}): TemplateVersion {
  const c = row.cells;
  return {
    id: row.id,
    templateId: (c.template_id as string) ?? '',
    versionNumber: (c.version_number as number) ?? 1,
    templateJson: (c.template_json as string) ?? '{}',
    changeSummary: (c.change_summary as string) ?? undefined,
    createdAt: String(row.createdAt),
  };
}

export class DataBrainTemplateAdapter implements TemplateStorageAdapter {
  private readonly client: DataBrain;
  private readonly templatesTableId: string;
  private readonly versionsTableId: string;

  constructor(config: DataBrainAdapterConfig) {
    this.client = config.client;
    this.templatesTableId = config.templatesTableId;
    this.versionsTableId = config.versionsTableId;
  }

  async createTemplate(input: CreateTemplateInput): Promise<Template> {
    const row = await this.client.createRow({
      tableId: this.templatesTableId,
      cells: {
        name: input.name,
        description: input.description ?? null,
        category: input.category ?? null,
        tags: input.tags ?? [],
        status: 'draft',
        template_json: input.templateJson,
        thumbnail_file_id: null,
        version: 1,
      },
    });
    return rowToTemplate(row);
  }

  async getTemplate(id: string): Promise<Template | null> {
    const row = await this.client.getRow(id);
    if (!row) return null;
    return rowToTemplate(row);
  }

  async listTemplates(
    options?: TemplateListOptions
  ): Promise<{ data: Template[]; total: number }> {
    const page = options?.page ?? 1;
    const pageSize = options?.pageSize ?? 20;
    const offset = (page - 1) * pageSize;

    const filters: Array<{ columnId: string; operator: 'equals' | 'contains'; value: string }> = [];

    if (options?.status) {
      filters.push({ columnId: 'status', operator: 'equals', value: options.status });
    }
    if (options?.category) {
      filters.push({ columnId: 'category', operator: 'equals', value: options.category });
    }
    if (options?.search) {
      filters.push({ columnId: 'name', operator: 'contains', value: options.search });
    }

    const result = await this.client.getRows(this.templatesTableId, {
      limit: pageSize,
      offset,
      filters: filters.length > 0 ? filters : undefined,
      sorts: [{ columnId: 'updatedAt', direction: 'desc' as const }],
    });

    return {
      data: result.items.map(rowToTemplate),
      total: result.total,
    };
  }

  async updateTemplate(id: string, input: UpdateTemplateInput): Promise<Template> {
    const cells: Record<string, unknown> = {};
    if (input.name !== undefined) cells.name = input.name;
    if (input.description !== undefined) cells.description = input.description;
    if (input.category !== undefined) cells.category = input.category;
    if (input.tags !== undefined) cells.tags = input.tags;
    if (input.status !== undefined) cells.status = input.status;
    if (input.templateJson !== undefined) cells.template_json = input.templateJson;

    const existing = await this.getTemplate(id);
    if (existing && input.templateJson !== undefined) {
      cells.version = existing.version + 1;
    }

    const row = await this.client.updateRow(id, cells as Record<string, string | number | boolean | null | string[] | Date>);
    return rowToTemplate(row);
  }

  async deleteTemplate(id: string): Promise<void> {
    await this.client.deleteRow(id);
  }

  async duplicateTemplate(id: string, newName: string): Promise<Template> {
    const original = await this.getTemplate(id);
    if (!original) throw new Error(`Template ${id} not found`);

    return this.createTemplate({
      name: newName,
      description: original.description,
      category: original.category,
      tags: original.tags,
      templateJson: original.templateJson,
    });
  }

  async archiveTemplate(id: string): Promise<void> {
    await this.updateTemplate(id, { status: 'archived' });
  }

  async createVersion(
    templateId: string,
    json: string,
    summary?: string
  ): Promise<TemplateVersion> {
    const versions = await this.listVersions(templateId);
    const nextVersionNumber = versions.length > 0
      ? Math.max(...versions.map((v) => v.versionNumber)) + 1
      : 1;

    const row = await this.client.createRow({
      tableId: this.versionsTableId,
      cells: {
        template_id: templateId,
        version_number: nextVersionNumber,
        template_json: json,
        change_summary: summary ?? null,
      },
    });

    return rowToVersion(row);
  }

  async listVersions(templateId: string): Promise<TemplateVersion[]> {
    const result = await this.client.getRows(this.versionsTableId, {
      filters: [{ columnId: 'template_id', operator: 'equals' as const, value: templateId as string }],
      sorts: [{ columnId: 'version_number', direction: 'desc' as const }],
      limit: 100,
    });

    return result.items.map(rowToVersion);
  }

  async restoreVersion(templateId: string, versionId: string): Promise<Template> {
    const versionRow = await this.client.getRow(versionId);
    if (!versionRow) throw new Error(`Version ${versionId} not found`);

    const version = rowToVersion(versionRow);
    if (version.templateId !== templateId) {
      throw new Error(`Version ${versionId} does not belong to template ${templateId}`);
    }

    return this.updateTemplate(templateId, {
      templateJson: version.templateJson,
    });
  }
}
