export type TemplateStatus = 'draft' | 'active' | 'archived';

export interface Template {
  id: string;
  name: string;
  description?: string;
  category?: string;
  tags: string[];
  status: TemplateStatus;
  templateJson: string;
  thumbnailUrl?: string;
  thumbnailFileId?: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface TemplateVersion {
  id: string;
  templateId: string;
  versionNumber: number;
  templateJson: string;
  changeSummary?: string;
  createdAt: string;
}

export interface CreateTemplateInput {
  name: string;
  description?: string;
  category?: string;
  tags?: string[];
  templateJson: string;
}

export interface UpdateTemplateInput {
  name?: string;
  description?: string;
  category?: string;
  tags?: string[];
  templateJson?: string;
  status?: TemplateStatus;
}

export interface TemplateListOptions {
  status?: TemplateStatus;
  category?: string;
  tags?: string[];
  search?: string;
  page?: number;
  pageSize?: number;
}
