import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WorkspaceManager } from '../workspace-manager';
import type { TeamsStorageAdapter } from '../adapter';
import type { WorkspaceMember } from '../types';

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

const makeOwner = (workspaceId = 'ws-1'): WorkspaceMember => ({
  id: 'member-owner',
  workspaceId,
  userId: 'user-owner',
  email: 'owner@test.com',
  role: 'owner',
  invitedAt: '2026-01-01T00:00:00Z',
  acceptedAt: '2026-01-01T00:00:00Z',
});

const makeAdmin = (workspaceId = 'ws-1'): WorkspaceMember => ({
  id: 'member-admin',
  workspaceId,
  userId: 'user-admin',
  email: 'admin@test.com',
  role: 'admin',
  invitedAt: '2026-01-01T00:00:00Z',
  acceptedAt: '2026-01-01T00:00:00Z',
});

const makeEditor = (workspaceId = 'ws-1'): WorkspaceMember => ({
  id: 'member-editor',
  workspaceId,
  userId: 'user-editor',
  email: 'editor@test.com',
  role: 'editor',
  invitedAt: '2026-01-02T00:00:00Z',
  acceptedAt: '2026-01-02T00:00:00Z',
});

describe('WorkspaceManager', () => {
  let adapter: TeamsStorageAdapter;
  let manager: WorkspaceManager;

  beforeEach(() => {
    adapter = createMockAdapter();
    manager = new WorkspaceManager(adapter);
  });

  describe('createWorkspace', () => {
    it('creates workspace with owner member', async () => {
      vi.mocked(adapter.createMember).mockResolvedValue(makeOwner());

      const result = await manager.createWorkspace('user-owner', 'owner@test.com', 'Owner');
      expect(result.role).toBe('owner');
      expect(adapter.createMember).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-owner',
          email: 'owner@test.com',
          name: 'Owner',
          role: 'owner',
        })
      );
    });
  });

  describe('inviteMember', () => {
    it('allows admin to invite', async () => {
      vi.mocked(adapter.getMember).mockImplementation(async (_wsId, userId) => {
        if (userId === 'user-admin') return makeAdmin();
        return null;
      });
      const newMember: WorkspaceMember = {
        id: 'member-new',
        workspaceId: 'ws-1',
        userId: 'user-new',
        email: 'new@test.com',
        role: 'editor',
        invitedAt: '2026-01-03T00:00:00Z',
      };
      vi.mocked(adapter.createMember).mockResolvedValue(newMember);

      const result = await manager.inviteMember(
        { workspaceId: 'ws-1', userId: 'user-new', email: 'new@test.com', role: 'editor' },
        'user-admin'
      );
      expect(result.email).toBe('new@test.com');
    });

    it('rejects invite from editor (no member.invite permission)', async () => {
      vi.mocked(adapter.getMember).mockResolvedValue(makeEditor());

      await expect(
        manager.inviteMember(
          { workspaceId: 'ws-1', userId: 'user-new', email: 'new@test.com', role: 'editor' },
          'user-editor'
        )
      ).rejects.toThrow('Insufficient permissions to invite members');
    });

    it('rejects invite if user is already a member', async () => {
      vi.mocked(adapter.getMember).mockImplementation(async (_wsId, userId) => {
        if (userId === 'user-admin') return makeAdmin();
        if (userId === 'user-editor') return makeEditor();
        return null;
      });

      await expect(
        manager.inviteMember(
          { workspaceId: 'ws-1', userId: 'user-editor', email: 'editor@test.com', role: 'editor' },
          'user-admin'
        )
      ).rejects.toThrow('User is already a member');
    });

    it('rejects invite from non-member', async () => {
      vi.mocked(adapter.getMember).mockResolvedValue(null);

      await expect(
        manager.inviteMember(
          { workspaceId: 'ws-1', userId: 'user-new', email: 'new@test.com', role: 'editor' },
          'unknown-user'
        )
      ).rejects.toThrow('Inviter is not a member of this workspace');
    });
  });

  describe('changeMemberRole', () => {
    it('allows owner to promote to admin', async () => {
      vi.mocked(adapter.getMemberById).mockResolvedValue(makeEditor());
      vi.mocked(adapter.getMember).mockResolvedValue(makeOwner());
      vi.mocked(adapter.updateMemberRole).mockResolvedValue({
        ...makeEditor(),
        role: 'admin',
      });

      const result = await manager.changeMemberRole('member-editor', 'admin', 'user-owner');
      expect(result.role).toBe('admin');
    });

    it('prevents non-owner from promoting to owner', async () => {
      vi.mocked(adapter.getMemberById).mockResolvedValue(makeEditor());
      vi.mocked(adapter.getMember).mockResolvedValue(makeAdmin());

      await expect(
        manager.changeMemberRole('member-editor', 'owner', 'user-admin')
      ).rejects.toThrow('Only owners can promote to owner');
    });

    it('prevents editor from changing roles', async () => {
      vi.mocked(adapter.getMemberById).mockResolvedValue({
        ...makeEditor(),
        id: 'member-viewer',
        userId: 'user-viewer',
        role: 'viewer',
      });
      vi.mocked(adapter.getMember).mockResolvedValue(makeEditor());

      await expect(
        manager.changeMemberRole('member-viewer', 'editor', 'user-editor')
      ).rejects.toThrow('Insufficient permissions');
    });
  });

  describe('removeMember', () => {
    it('allows admin to remove editor', async () => {
      vi.mocked(adapter.getMemberById).mockResolvedValue(makeEditor());
      vi.mocked(adapter.getMember).mockResolvedValue(makeAdmin());
      vi.mocked(adapter.removeMember).mockResolvedValue();

      await manager.removeMember('member-editor', 'user-admin');
      expect(adapter.removeMember).toHaveBeenCalledWith('member-editor');
    });

    it('prevents removing the owner', async () => {
      vi.mocked(adapter.getMemberById).mockResolvedValue(makeOwner());

      await expect(
        manager.removeMember('member-owner', 'user-admin')
      ).rejects.toThrow('Cannot remove the workspace owner');
    });

    it('prevents editor from removing members', async () => {
      vi.mocked(adapter.getMemberById).mockResolvedValue({
        ...makeEditor(),
        id: 'member-viewer',
        userId: 'user-viewer',
        role: 'viewer',
      });
      vi.mocked(adapter.getMember).mockResolvedValue(makeEditor());

      await expect(
        manager.removeMember('member-viewer', 'user-editor')
      ).rejects.toThrow('Insufficient permissions');
    });
  });

  describe('acceptInvitation', () => {
    it('delegates to adapter', async () => {
      const accepted = { ...makeEditor(), acceptedAt: '2026-01-03T00:00:00Z' };
      vi.mocked(adapter.acceptInvitation).mockResolvedValue(accepted);

      const result = await manager.acceptInvitation('member-editor');
      expect(result.acceptedAt).toBeDefined();
    });
  });

  describe('listMembers', () => {
    it('returns all members', async () => {
      vi.mocked(adapter.listMembers).mockResolvedValue([makeOwner(), makeEditor()]);

      const result = await manager.listMembers('ws-1');
      expect(result).toHaveLength(2);
    });
  });
});
