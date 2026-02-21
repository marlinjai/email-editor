import { describe, it, expect } from 'vitest';
import { PERMISSIONS } from '../types';
import { WorkspaceManager } from '../workspace-manager';
import type { TeamsStorageAdapter } from '../adapter';

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

describe('PERMISSIONS', () => {
  it('owner has wildcard permission', () => {
    expect(PERMISSIONS.owner).toEqual(['*']);
  });

  it('admin has template.approve but not wildcard', () => {
    expect(PERMISSIONS.admin).toContain('template.approve');
    expect(PERMISSIONS.admin).not.toContain('*');
  });

  it('editor can create templates and campaigns', () => {
    expect(PERMISSIONS.editor).toContain('template.create');
    expect(PERMISSIONS.editor).toContain('template.edit');
    expect(PERMISSIONS.editor).toContain('campaign.create');
  });

  it('editor cannot approve templates or send campaigns', () => {
    expect(PERMISSIONS.editor).not.toContain('template.approve');
    expect(PERMISSIONS.editor).not.toContain('campaign.send');
  });

  it('viewer has read-only permissions', () => {
    expect(PERMISSIONS.viewer).toEqual(['template.view', 'campaign.view', 'contact.view']);
  });
});

describe('WorkspaceManager.hasPermission', () => {
  const adapter = createMockAdapter();
  const manager = new WorkspaceManager(adapter);

  it('owner has all permissions', () => {
    expect(manager.hasPermission('owner', 'template.create')).toBe(true);
    expect(manager.hasPermission('owner', 'anything.at.all')).toBe(true);
  });

  it('admin has member.invite', () => {
    expect(manager.hasPermission('admin', 'member.invite')).toBe(true);
  });

  it('editor does not have member.invite', () => {
    expect(manager.hasPermission('editor', 'member.invite')).toBe(false);
  });

  it('viewer does not have template.edit', () => {
    expect(manager.hasPermission('viewer', 'template.edit')).toBe(false);
  });

  it('viewer has template.view', () => {
    expect(manager.hasPermission('viewer', 'template.view')).toBe(true);
  });
});
