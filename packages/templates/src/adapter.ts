import type {
  Template,
  TemplateVersion,
  CreateTemplateInput,
  UpdateTemplateInput,
  TemplateListOptions,
} from './types';

export interface TemplateStorageAdapter {
  createTemplate(input: CreateTemplateInput): Promise<Template>;
  getTemplate(id: string): Promise<Template | null>;
  listTemplates(options?: TemplateListOptions): Promise<{ data: Template[]; total: number }>;
  updateTemplate(id: string, input: UpdateTemplateInput): Promise<Template>;
  deleteTemplate(id: string): Promise<void>;
  duplicateTemplate(id: string, newName: string): Promise<Template>;
  archiveTemplate(id: string): Promise<void>;
  createVersion(templateId: string, json: string, summary?: string): Promise<TemplateVersion>;
  listVersions(templateId: string): Promise<TemplateVersion[]>;
  restoreVersion(templateId: string, versionId: string): Promise<Template>;
}
