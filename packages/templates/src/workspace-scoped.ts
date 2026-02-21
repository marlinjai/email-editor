import type { TemplateStorageAdapter } from './adapter';
import type {
  Template,
  TemplateVersion,
  CreateTemplateInput,
  UpdateTemplateInput,
  TemplateListOptions,
} from './types';
import type {
  WorkspaceRole,
  ApprovalRequest,
  TeamsStorageAdapter,
} from '@marlinjai/email-teams';
import { PERMISSIONS } from '@marlinjai/email-teams';
import { TemplateManager, type TemplateManagerConfig } from './manager';

export interface WorkspaceScopedConfig extends TemplateManagerConfig {
  teamsAdapter: TeamsStorageAdapter;
  workspaceId: string;
  userId: string;
  userRole: WorkspaceRole;
}

// Map of permissions that imply other permissions (manage/edit implies view)
const IMPLIES: Record<string, string> = {
  'contact.view': 'contact.manage',
  'template.view': 'template.edit',
  'campaign.view': 'campaign.create',
};

function hasPermission(role: WorkspaceRole, permission: string): boolean {
  const perms = PERMISSIONS[role];
  if (perms.includes('*')) return true;
  if (perms.includes(permission)) return true;
  const impliedBy = IMPLIES[permission];
  if (impliedBy && perms.includes(impliedBy)) return true;
  return false;
}

/**
 * Wraps TemplateManager with workspace-scoped permission checks,
 * template locking for approved templates, and approval workflow integration.
 */
export class WorkspaceScopedTemplateManager {
  private readonly manager: TemplateManager;
  private readonly teamsAdapter: TeamsStorageAdapter;
  private readonly workspaceId: string;
  private readonly userId: string;
  private readonly userRole: WorkspaceRole;

  constructor(config: WorkspaceScopedConfig) {
    this.manager = new TemplateManager({
      adapter: config.adapter,
      autoVersion: config.autoVersion,
    });
    this.teamsAdapter = config.teamsAdapter;
    this.workspaceId = config.workspaceId;
    this.userId = config.userId;
    this.userRole = config.userRole;
  }

  async createTemplate(input: CreateTemplateInput): Promise<Template> {
    this.assertPermission('template.create');
    const template = await this.manager.createTemplate(input);
    await this.logAction('template.created', template.id);
    return template;
  }

  async getTemplate(id: string): Promise<Template | null> {
    this.assertPermission('template.view');
    return this.manager.getTemplate(id);
  }

  async listTemplates(options?: TemplateListOptions): Promise<{ data: Template[]; total: number }> {
    this.assertPermission('template.view');
    return this.manager.listTemplates(options);
  }

  async updateTemplate(id: string, input: UpdateTemplateInput): Promise<Template> {
    this.assertPermission('template.edit');
    await this.assertNotLocked(id);
    const template = await this.manager.updateTemplate(id, input);
    await this.logAction('template.updated', id);
    return template;
  }

  async deleteTemplate(id: string): Promise<void> {
    this.assertPermission('template.delete');
    await this.logAction('template.deleted', id);
    return this.manager.deleteTemplate(id);
  }

  async duplicateTemplate(id: string, newName?: string): Promise<Template> {
    this.assertPermission('template.create');
    const template = await this.manager.duplicateTemplate(id, newName);
    await this.logAction('template.duplicated', template.id, { sourceId: id });
    return template;
  }

  async archiveTemplate(id: string): Promise<void> {
    this.assertPermission('template.edit');
    await this.logAction('template.archived', id);
    return this.manager.archiveTemplate(id);
  }

  async createVersion(templateId: string, json: string, summary?: string): Promise<TemplateVersion> {
    this.assertPermission('template.edit');
    await this.assertNotLocked(templateId);
    return this.manager.createVersion(templateId, json, summary);
  }

  async listVersions(templateId: string): Promise<TemplateVersion[]> {
    this.assertPermission('template.view');
    return this.manager.listVersions(templateId);
  }

  async restoreVersion(templateId: string, versionId: string): Promise<Template> {
    this.assertPermission('template.edit');
    await this.assertNotLocked(templateId);
    const template = await this.manager.restoreVersion(templateId, versionId);
    await this.logAction('template.version_restored', templateId, { versionId });
    return template;
  }

  exportTemplate(template: Template): string {
    return this.manager.exportTemplate(template);
  }

  async importTemplate(jsonString: string): Promise<Template> {
    this.assertPermission('template.create');
    const template = await this.manager.importTemplate(jsonString);
    await this.logAction('template.imported', template.id);
    return template;
  }

  // --- Approval workflow integration ---

  async requestApproval(templateId: string): Promise<ApprovalRequest> {
    this.assertPermission('template.edit');
    const approval = await this.teamsAdapter.createApproval({
      resourceType: 'template',
      resourceId: templateId,
      requestedBy: this.userId,
    });
    await this.logAction('template.approval_requested', templateId);
    return approval;
  }

  async approveTemplate(approvalId: string, note?: string): Promise<ApprovalRequest> {
    this.assertPermission('template.approve');
    const approval = await this.teamsAdapter.updateApprovalStatus(
      approvalId,
      'approved',
      this.userId,
      note
    );
    await this.logAction('template.approved', approval.resourceId, { approvalId, note });
    return approval;
  }

  async rejectTemplate(approvalId: string, note?: string): Promise<ApprovalRequest> {
    this.assertPermission('template.approve');
    const approval = await this.teamsAdapter.updateApprovalStatus(
      approvalId,
      'rejected',
      this.userId,
      note
    );
    await this.logAction('template.rejected', approval.resourceId, { approvalId, note });
    return approval;
  }

  async isApproved(templateId: string): Promise<boolean> {
    const approval = await this.teamsAdapter.getApprovalByResource('template', templateId);
    return approval?.status === 'approved';
  }

  // --- Internal helpers ---

  private assertPermission(permission: string): void {
    if (!hasPermission(this.userRole, permission)) {
      throw new Error(
        `Permission denied: role '${this.userRole}' does not have '${permission}'`
      );
    }
  }

  private async assertNotLocked(templateId: string): Promise<void> {
    const approval = await this.teamsAdapter.getApprovalByResource('template', templateId);
    if (approval?.status === 'approved') {
      throw new Error(
        'Template is locked: approved templates cannot be edited. Create a new version or request re-approval.'
      );
    }
  }

  private async logAction(
    action: string,
    resourceId: string,
    details?: Record<string, unknown>
  ): Promise<void> {
    await this.teamsAdapter.createAuditEntry({
      workspaceId: this.workspaceId,
      userId: this.userId,
      action,
      resourceType: 'template',
      resourceId,
      details,
    });
  }
}
