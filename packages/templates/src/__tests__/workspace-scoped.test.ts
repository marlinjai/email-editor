import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WorkspaceScopedTemplateManager } from '../workspace-scoped';
import type { TemplateStorageAdapter } from '../adapter';
import type { Template } from '../types';
import type { TeamsStorageAdapter } from '@marlinjai/email-teams';

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

function createMockTemplateAdapter(): TemplateStorageAdapter {
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

function createMockTeamsAdapter(): TeamsStorageAdapter {
  return {
    createMember: vi.fn(),
    getMember: vi.fn(),
    getMemberById: vi.fn(),
    listMembers: vi.fn(),
    updateMemberRole: vi.fn(),
    acceptInvitation: vi.fn(),
    removeMember: vi.fn(),
    createApproval: vi.fn(),
    getApproval: vi.fn(),
    listPendingApprovals: vi.fn(),
    updateApprovalStatus: vi.fn(),
    getApprovalByResource: vi.fn(),
    createAuditEntry: vi.fn(),
    queryAuditLog: vi.fn(),
    createBrandKit: vi.fn(),
    getBrandKit: vi.fn(),
    getBrandKitByWorkspace: vi.fn(),
    updateBrandKit: vi.fn(),
    deleteBrandKit: vi.fn(),
  };
}

describe('WorkspaceScopedTemplateManager', () => {
  let templateAdapter: TemplateStorageAdapter;
  let teamsAdapter: TeamsStorageAdapter;

  beforeEach(() => {
    templateAdapter = createMockTemplateAdapter();
    teamsAdapter = createMockTeamsAdapter();
    vi.mocked(teamsAdapter.getApprovalByResource).mockResolvedValue(null);
    vi.mocked(teamsAdapter.createAuditEntry).mockResolvedValue({
      id: 'audit-1',
      workspaceId: 'ws-1',
      userId: 'user-1',
      action: '',
      resourceType: '',
      resourceId: '',
      occurredAt: new Date().toISOString(),
    });
  });

  function createManager(role: 'owner' | 'admin' | 'editor' | 'viewer') {
    return new WorkspaceScopedTemplateManager({
      adapter: templateAdapter,
      teamsAdapter,
      workspaceId: 'ws-1',
      userId: 'user-1',
      userRole: role,
    });
  }

  // --- Permission checks ---

  describe('permission enforcement', () => {
    it('owner can do everything', async () => {
      const mgr = createManager('owner');
      vi.mocked(templateAdapter.createTemplate).mockResolvedValue(createMockTemplate());
      vi.mocked(templateAdapter.getTemplate).mockResolvedValue(createMockTemplate());
      vi.mocked(templateAdapter.listTemplates).mockResolvedValue({ data: [], total: 0 });

      await expect(mgr.createTemplate({ name: 'T', templateJson: '{}' })).resolves.toBeDefined();
      await expect(mgr.getTemplate('tpl-1')).resolves.toBeDefined();
      await expect(mgr.listTemplates()).resolves.toBeDefined();
    });

    it('editor can create and edit but not delete or approve', async () => {
      const mgr = createManager('editor');
      vi.mocked(templateAdapter.createTemplate).mockResolvedValue(createMockTemplate());

      await expect(mgr.createTemplate({ name: 'T', templateJson: '{}' })).resolves.toBeDefined();
      await expect(mgr.deleteTemplate('tpl-1')).rejects.toThrow('Permission denied');
      await expect(mgr.approveTemplate('apr-1')).rejects.toThrow('Permission denied');
    });

    it('viewer can only read', async () => {
      const mgr = createManager('viewer');
      vi.mocked(templateAdapter.getTemplate).mockResolvedValue(createMockTemplate());
      vi.mocked(templateAdapter.listTemplates).mockResolvedValue({ data: [], total: 0 });

      await expect(mgr.getTemplate('tpl-1')).resolves.toBeDefined();
      await expect(mgr.listTemplates()).resolves.toBeDefined();
      await expect(mgr.createTemplate({ name: 'T', templateJson: '{}' })).rejects.toThrow('Permission denied');
      await expect(mgr.updateTemplate('tpl-1', { name: 'X' })).rejects.toThrow('Permission denied');
      await expect(mgr.deleteTemplate('tpl-1')).rejects.toThrow('Permission denied');
    });

    it('admin can approve templates', async () => {
      const mgr = createManager('admin');
      vi.mocked(teamsAdapter.updateApprovalStatus).mockResolvedValue({
        id: 'apr-1',
        resourceType: 'template',
        resourceId: 'tpl-1',
        requestedBy: 'user-2',
        status: 'approved',
        reviewedBy: 'user-1',
        createdAt: '2026-01-01T00:00:00Z',
        reviewedAt: '2026-01-02T00:00:00Z',
      });

      const result = await mgr.approveTemplate('apr-1', 'LGTM');
      expect(result.status).toBe('approved');
    });
  });

  // --- Template locking ---

  describe('template locking for approved templates', () => {
    it('prevents editing an approved template', async () => {
      const mgr = createManager('owner');
      vi.mocked(teamsAdapter.getApprovalByResource).mockResolvedValue({
        id: 'apr-1',
        resourceType: 'template',
        resourceId: 'tpl-1',
        requestedBy: 'user-2',
        status: 'approved',
        createdAt: '2026-01-01T00:00:00Z',
      });

      await expect(
        mgr.updateTemplate('tpl-1', { name: 'New Name' })
      ).rejects.toThrow('Template is locked');
    });

    it('prevents version restore on approved template', async () => {
      const mgr = createManager('owner');
      vi.mocked(teamsAdapter.getApprovalByResource).mockResolvedValue({
        id: 'apr-1',
        resourceType: 'template',
        resourceId: 'tpl-1',
        requestedBy: 'user-2',
        status: 'approved',
        createdAt: '2026-01-01T00:00:00Z',
      });

      await expect(
        mgr.restoreVersion('tpl-1', 'ver-1')
      ).rejects.toThrow('Template is locked');
    });

    it('allows editing when approval is pending', async () => {
      const mgr = createManager('editor');
      vi.mocked(teamsAdapter.getApprovalByResource).mockResolvedValue({
        id: 'apr-1',
        resourceType: 'template',
        resourceId: 'tpl-1',
        requestedBy: 'user-2',
        status: 'pending',
        createdAt: '2026-01-01T00:00:00Z',
      });
      vi.mocked(templateAdapter.updateTemplate).mockResolvedValue(
        createMockTemplate({ name: 'Updated' })
      );

      await expect(
        mgr.updateTemplate('tpl-1', { name: 'Updated' })
      ).resolves.toBeDefined();
    });

    it('allows editing when approval was rejected', async () => {
      const mgr = createManager('editor');
      vi.mocked(teamsAdapter.getApprovalByResource).mockResolvedValue({
        id: 'apr-1',
        resourceType: 'template',
        resourceId: 'tpl-1',
        requestedBy: 'user-2',
        status: 'rejected',
        createdAt: '2026-01-01T00:00:00Z',
      });
      vi.mocked(templateAdapter.updateTemplate).mockResolvedValue(
        createMockTemplate({ name: 'Fixed' })
      );

      await expect(
        mgr.updateTemplate('tpl-1', { name: 'Fixed' })
      ).resolves.toBeDefined();
    });
  });

  // --- Approval workflow ---

  describe('approval workflow', () => {
    it('editor can request approval', async () => {
      const mgr = createManager('editor');
      vi.mocked(teamsAdapter.createApproval).mockResolvedValue({
        id: 'apr-1',
        resourceType: 'template',
        resourceId: 'tpl-1',
        requestedBy: 'user-1',
        status: 'pending',
        createdAt: '2026-01-01T00:00:00Z',
      });

      const result = await mgr.requestApproval('tpl-1');
      expect(result.status).toBe('pending');
      expect(teamsAdapter.createApproval).toHaveBeenCalledWith({
        resourceType: 'template',
        resourceId: 'tpl-1',
        requestedBy: 'user-1',
      });
    });

    it('admin can reject with note', async () => {
      const mgr = createManager('admin');
      vi.mocked(teamsAdapter.updateApprovalStatus).mockResolvedValue({
        id: 'apr-1',
        resourceType: 'template',
        resourceId: 'tpl-1',
        requestedBy: 'user-2',
        status: 'rejected',
        reviewedBy: 'user-1',
        reviewNote: 'Needs fixes',
        createdAt: '2026-01-01T00:00:00Z',
        reviewedAt: '2026-01-02T00:00:00Z',
      });

      const result = await mgr.rejectTemplate('apr-1', 'Needs fixes');
      expect(result.status).toBe('rejected');
      expect(result.reviewNote).toBe('Needs fixes');
    });

    it('isApproved returns true for approved templates', async () => {
      const mgr = createManager('viewer');
      vi.mocked(teamsAdapter.getApprovalByResource).mockResolvedValue({
        id: 'apr-1',
        resourceType: 'template',
        resourceId: 'tpl-1',
        requestedBy: 'user-2',
        status: 'approved',
        createdAt: '2026-01-01T00:00:00Z',
      });

      expect(await mgr.isApproved('tpl-1')).toBe(true);
    });

    it('isApproved returns false when no approval exists', async () => {
      const mgr = createManager('viewer');
      vi.mocked(teamsAdapter.getApprovalByResource).mockResolvedValue(null);
      expect(await mgr.isApproved('tpl-1')).toBe(false);
    });
  });

  // --- Audit logging ---

  describe('audit logging', () => {
    it('logs template creation', async () => {
      const mgr = createManager('admin');
      vi.mocked(templateAdapter.createTemplate).mockResolvedValue(createMockTemplate());

      await mgr.createTemplate({ name: 'T', templateJson: '{}' });

      expect(teamsAdapter.createAuditEntry).toHaveBeenCalledWith({
        workspaceId: 'ws-1',
        userId: 'user-1',
        action: 'template.created',
        resourceType: 'template',
        resourceId: 'tpl-1',
        details: undefined,
      });
    });

    it('logs template deletion', async () => {
      const mgr = createManager('admin');
      vi.mocked(templateAdapter.deleteTemplate).mockResolvedValue();

      await mgr.deleteTemplate('tpl-1');

      expect(teamsAdapter.createAuditEntry).toHaveBeenCalledWith({
        workspaceId: 'ws-1',
        userId: 'user-1',
        action: 'template.deleted',
        resourceType: 'template',
        resourceId: 'tpl-1',
        details: undefined,
      });
    });

    it('logs template update', async () => {
      const mgr = createManager('editor');
      vi.mocked(templateAdapter.updateTemplate).mockResolvedValue(
        createMockTemplate({ name: 'Updated' })
      );

      await mgr.updateTemplate('tpl-1', { name: 'Updated' });

      expect(teamsAdapter.createAuditEntry).toHaveBeenCalledWith({
        workspaceId: 'ws-1',
        userId: 'user-1',
        action: 'template.updated',
        resourceType: 'template',
        resourceId: 'tpl-1',
        details: undefined,
      });
    });

    it('logs duplication with source template ID', async () => {
      const mgr = createManager('admin');
      vi.mocked(templateAdapter.getTemplate).mockResolvedValue(createMockTemplate());
      vi.mocked(templateAdapter.duplicateTemplate).mockResolvedValue(
        createMockTemplate({ id: 'tpl-2', name: 'Copy' })
      );

      await mgr.duplicateTemplate('tpl-1', 'Copy');

      expect(teamsAdapter.createAuditEntry).toHaveBeenCalledWith({
        workspaceId: 'ws-1',
        userId: 'user-1',
        action: 'template.duplicated',
        resourceType: 'template',
        resourceId: 'tpl-2',
        details: { sourceId: 'tpl-1' },
      });
    });
  });
});
