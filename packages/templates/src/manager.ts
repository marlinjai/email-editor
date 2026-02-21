import type { TemplateStorageAdapter } from './adapter';
import type {
  Template,
  TemplateVersion,
  CreateTemplateInput,
  UpdateTemplateInput,
  TemplateListOptions,
} from './types';
import { z } from 'zod';

const createTemplateSchema = z.object({
  name: z.string().min(1, 'Template name is required').max(255),
  description: z.string().max(2000).optional(),
  category: z.string().max(100).optional(),
  tags: z.array(z.string().max(50)).max(20).optional(),
  templateJson: z.string().min(1, 'Template JSON is required'),
});

const updateTemplateSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(2000).optional(),
  category: z.string().max(100).optional(),
  tags: z.array(z.string().max(50)).max(20).optional(),
  templateJson: z.string().min(1).optional(),
  status: z.enum(['draft', 'active', 'archived']).optional(),
});

export interface TemplateManagerConfig {
  adapter: TemplateStorageAdapter;
  autoVersion?: boolean;
}

export class TemplateManager {
  private readonly adapter: TemplateStorageAdapter;
  private readonly autoVersion: boolean;

  constructor(config: TemplateManagerConfig) {
    this.adapter = config.adapter;
    this.autoVersion = config.autoVersion ?? true;
  }

  async createTemplate(input: CreateTemplateInput): Promise<Template> {
    const validated = createTemplateSchema.parse(input);
    return this.adapter.createTemplate(validated);
  }

  async getTemplate(id: string): Promise<Template | null> {
    return this.adapter.getTemplate(id);
  }

  async listTemplates(options?: TemplateListOptions): Promise<{ data: Template[]; total: number }> {
    return this.adapter.listTemplates(options);
  }

  async updateTemplate(id: string, input: UpdateTemplateInput): Promise<Template> {
    const validated = updateTemplateSchema.parse(input);

    if (this.autoVersion && validated.templateJson) {
      const existing = await this.adapter.getTemplate(id);
      if (existing) {
        await this.adapter.createVersion(
          id,
          existing.templateJson,
          `Auto-saved v${existing.version}`
        );
      }
    }

    return this.adapter.updateTemplate(id, validated);
  }

  async deleteTemplate(id: string): Promise<void> {
    return this.adapter.deleteTemplate(id);
  }

  async duplicateTemplate(id: string, newName?: string): Promise<Template> {
    const original = await this.adapter.getTemplate(id);
    if (!original) throw new Error(`Template ${id} not found`);
    const name = newName ?? `${original.name} (copy)`;
    return this.adapter.duplicateTemplate(id, name);
  }

  async archiveTemplate(id: string): Promise<void> {
    return this.adapter.archiveTemplate(id);
  }

  async createVersion(
    templateId: string,
    json: string,
    summary?: string
  ): Promise<TemplateVersion> {
    return this.adapter.createVersion(templateId, json, summary);
  }

  async listVersions(templateId: string): Promise<TemplateVersion[]> {
    return this.adapter.listVersions(templateId);
  }

  async restoreVersion(templateId: string, versionId: string): Promise<Template> {
    return this.adapter.restoreVersion(templateId, versionId);
  }

  /**
   * Export a template as a JSON object for download.
   */
  exportTemplate(template: Template): string {
    return JSON.stringify(
      {
        name: template.name,
        description: template.description,
        category: template.category,
        tags: template.tags,
        templateJson: template.templateJson,
        version: template.version,
        exportedAt: new Date().toISOString(),
      },
      null,
      2
    );
  }

  /**
   * Import a template from an exported JSON string.
   */
  async importTemplate(jsonString: string): Promise<Template> {
    const data = JSON.parse(jsonString);
    return this.createTemplate({
      name: data.name,
      description: data.description,
      category: data.category,
      tags: data.tags,
      templateJson: data.templateJson,
    });
  }
}
