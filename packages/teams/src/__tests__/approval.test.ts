import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ApprovalManager } from '../approval';
import type { TeamsStorageAdapter } from '../adapter';
import type { ApprovalRequest } from '../types';

function createMockAdapter(): TeamsStorageAdapter {
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

describe('ApprovalManager', () => {
  let adapter: TeamsStorageAdapter;
  let manager: ApprovalManager;

  beforeEach(() => {
    adapter = createMockAdapter();
    manager = new ApprovalManager(adapter);
  });

  describe('requestApproval', () => {
    it('creates a new approval request', async () => {
      const expected: ApprovalRequest = {
        id: '1',
        resourceType: 'template',
        resourceId: 'tpl-1',
        requestedBy: 'user-1',
        status: 'pending',
        createdAt: '2026-01-01T00:00:00Z',
      };
      vi.mocked(adapter.getApprovalByResource).mockResolvedValue(null);
      vi.mocked(adapter.createApproval).mockResolvedValue(expected);

      const result = await manager.requestApproval('template', 'tpl-1', 'user-1');
      expect(result).toEqual(expected);
      expect(adapter.createApproval).toHaveBeenCalledWith({
        resourceType: 'template',
        resourceId: 'tpl-1',
        requestedBy: 'user-1',
      });
    });

    it('throws if a pending approval already exists', async () => {
      vi.mocked(adapter.getApprovalByResource).mockResolvedValue({
        id: '1',
        resourceType: 'template',
        resourceId: 'tpl-1',
        requestedBy: 'user-1',
        status: 'pending',
        createdAt: '2026-01-01T00:00:00Z',
      });

      await expect(
        manager.requestApproval('template', 'tpl-1', 'user-1')
      ).rejects.toThrow('An approval request already exists');
    });

    it('allows new request if previous was rejected', async () => {
      vi.mocked(adapter.getApprovalByResource).mockResolvedValue({
        id: '1',
        resourceType: 'template',
        resourceId: 'tpl-1',
        requestedBy: 'user-1',
        status: 'rejected',
        createdAt: '2026-01-01T00:00:00Z',
      });
      vi.mocked(adapter.createApproval).mockResolvedValue({
        id: '2',
        resourceType: 'template',
        resourceId: 'tpl-1',
        requestedBy: 'user-1',
        status: 'pending',
        createdAt: '2026-01-02T00:00:00Z',
      });

      const result = await manager.requestApproval('template', 'tpl-1', 'user-1');
      expect(result.id).toBe('2');
    });
  });

  describe('approve / reject', () => {
    it('allows owner to approve', async () => {
      const approved: ApprovalRequest = {
        id: '1',
        resourceType: 'template',
        resourceId: 'tpl-1',
        requestedBy: 'user-1',
        status: 'approved',
        reviewedBy: 'owner-1',
        reviewNote: 'Looks good',
        createdAt: '2026-01-01T00:00:00Z',
        reviewedAt: '2026-01-02T00:00:00Z',
      };
      vi.mocked(adapter.updateApprovalStatus).mockResolvedValue(approved);

      const result = await manager.approve('1', 'owner-1', 'owner', 'Looks good');
      expect(result.status).toBe('approved');
    });

    it('allows admin to approve', async () => {
      vi.mocked(adapter.updateApprovalStatus).mockResolvedValue({
        id: '1',
        resourceType: 'template',
        resourceId: 'tpl-1',
        requestedBy: 'user-1',
        status: 'approved',
        reviewedBy: 'admin-1',
        createdAt: '2026-01-01T00:00:00Z',
        reviewedAt: '2026-01-02T00:00:00Z',
      });

      const result = await manager.approve('1', 'admin-1', 'admin');
      expect(result.status).toBe('approved');
    });

    it('rejects when editor tries to approve', async () => {
      await expect(
        manager.approve('1', 'editor-1', 'editor')
      ).rejects.toThrow('Only admins and owners can approve');
    });

    it('rejects when viewer tries to reject', async () => {
      await expect(
        manager.reject('1', 'viewer-1', 'viewer')
      ).rejects.toThrow('Only admins and owners can approve');
    });

    it('allows admin to reject with note', async () => {
      vi.mocked(adapter.updateApprovalStatus).mockResolvedValue({
        id: '1',
        resourceType: 'campaign',
        resourceId: 'camp-1',
        requestedBy: 'user-1',
        status: 'rejected',
        reviewedBy: 'admin-1',
        reviewNote: 'Needs changes',
        createdAt: '2026-01-01T00:00:00Z',
        reviewedAt: '2026-01-02T00:00:00Z',
      });

      const result = await manager.reject('1', 'admin-1', 'admin', 'Needs changes');
      expect(result.status).toBe('rejected');
      expect(result.reviewNote).toBe('Needs changes');
    });
  });

  describe('isApproved', () => {
    it('returns true for approved resource', async () => {
      vi.mocked(adapter.getApprovalByResource).mockResolvedValue({
        id: '1',
        resourceType: 'template',
        resourceId: 'tpl-1',
        requestedBy: 'user-1',
        status: 'approved',
        createdAt: '2026-01-01T00:00:00Z',
      });

      expect(await manager.isApproved('template', 'tpl-1')).toBe(true);
    });

    it('returns false for pending resource', async () => {
      vi.mocked(adapter.getApprovalByResource).mockResolvedValue({
        id: '1',
        resourceType: 'template',
        resourceId: 'tpl-1',
        requestedBy: 'user-1',
        status: 'pending',
        createdAt: '2026-01-01T00:00:00Z',
      });

      expect(await manager.isApproved('template', 'tpl-1')).toBe(false);
    });

    it('returns false when no approval exists', async () => {
      vi.mocked(adapter.getApprovalByResource).mockResolvedValue(null);
      expect(await manager.isApproved('template', 'tpl-1')).toBe(false);
    });
  });

  describe('getStatus', () => {
    it('returns status string', async () => {
      vi.mocked(adapter.getApprovalByResource).mockResolvedValue({
        id: '1',
        resourceType: 'template',
        resourceId: 'tpl-1',
        requestedBy: 'user-1',
        status: 'rejected',
        createdAt: '2026-01-01T00:00:00Z',
      });

      expect(await manager.getStatus('template', 'tpl-1')).toBe('rejected');
    });

    it('returns null when no approval exists', async () => {
      vi.mocked(adapter.getApprovalByResource).mockResolvedValue(null);
      expect(await manager.getStatus('template', 'tpl-1')).toBeNull();
    });
  });
});
