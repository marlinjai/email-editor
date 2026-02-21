import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WorkspaceScopedContactManager } from '../workspace-scoped';
import type {
  Contact,
  ContactStorageAdapter,
} from '../types';
import type { TeamsStorageAdapter } from '@marlinjai/email-teams';

function createMockContact(overrides?: Partial<Contact>): Contact {
  return {
    id: 'ct-1',
    email: 'test@example.com',
    firstName: 'John',
    lastName: 'Doe',
    status: 'active',
    tags: [],
    customFields: {},
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function createMockContactAdapter(): ContactStorageAdapter {
  return {
    createContact: vi.fn(),
    getContact: vi.fn(),
    getContactByEmail: vi.fn(),
    listContacts: vi.fn(),
    updateContact: vi.fn(),
    deleteContact: vi.fn(),
    bulkCreateContacts: vi.fn(),
    createSegment: vi.fn(),
    listSegments: vi.fn(),
    getSegmentContacts: vi.fn(),
    deleteSegment: vi.fn(),
    recordUnsubscribe: vi.fn(),
    isUnsubscribed: vi.fn(),
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

describe('WorkspaceScopedContactManager', () => {
  let contactAdapter: ContactStorageAdapter;
  let teamsAdapter: TeamsStorageAdapter;

  beforeEach(() => {
    contactAdapter = createMockContactAdapter();
    teamsAdapter = createMockTeamsAdapter();
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
    return new WorkspaceScopedContactManager({
      adapter: contactAdapter,
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
      vi.mocked(contactAdapter.createContact).mockResolvedValue(createMockContact());
      vi.mocked(contactAdapter.getContact).mockResolvedValue(createMockContact());
      vi.mocked(contactAdapter.listContacts).mockResolvedValue({ data: [], total: 0 });
      vi.mocked(contactAdapter.deleteContact).mockResolvedValue();

      await expect(mgr.createContact({ email: 'a@b.com' })).resolves.toBeDefined();
      await expect(mgr.getContact('ct-1')).resolves.toBeDefined();
      await expect(mgr.listContacts()).resolves.toBeDefined();
      await expect(mgr.deleteContact('ct-1')).resolves.toBeUndefined();
    });

    it('editor can manage contacts', async () => {
      const mgr = createManager('editor');
      vi.mocked(contactAdapter.createContact).mockResolvedValue(createMockContact());
      vi.mocked(contactAdapter.updateContact).mockResolvedValue(createMockContact());
      vi.mocked(contactAdapter.deleteContact).mockResolvedValue();

      await expect(mgr.createContact({ email: 'a@b.com' })).resolves.toBeDefined();
      await expect(mgr.updateContact('ct-1', { firstName: 'Jane' })).resolves.toBeDefined();
      await expect(mgr.deleteContact('ct-1')).resolves.toBeUndefined();
    });

    it('viewer can only read contacts', async () => {
      const mgr = createManager('viewer');
      vi.mocked(contactAdapter.getContact).mockResolvedValue(createMockContact());
      vi.mocked(contactAdapter.listContacts).mockResolvedValue({ data: [], total: 0 });

      await expect(mgr.getContact('ct-1')).resolves.toBeDefined();
      await expect(mgr.listContacts()).resolves.toBeDefined();
      await expect(mgr.createContact({ email: 'a@b.com' })).rejects.toThrow('Permission denied');
      await expect(mgr.updateContact('ct-1', {})).rejects.toThrow('Permission denied');
      await expect(mgr.deleteContact('ct-1')).rejects.toThrow('Permission denied');
    });

    it('viewer cannot create segments', async () => {
      const mgr = createManager('viewer');
      await expect(mgr.createSegment('Seg', [])).rejects.toThrow('Permission denied');
    });

    it('viewer can list segments', async () => {
      const mgr = createManager('viewer');
      vi.mocked(contactAdapter.listSegments).mockResolvedValue([]);
      await expect(mgr.listSegments()).resolves.toEqual([]);
    });
  });

  // --- Audit logging ---

  describe('audit logging', () => {
    it('logs contact creation', async () => {
      const mgr = createManager('admin');
      vi.mocked(contactAdapter.createContact).mockResolvedValue(createMockContact());

      await mgr.createContact({ email: 'a@b.com' });

      expect(teamsAdapter.createAuditEntry).toHaveBeenCalledWith({
        workspaceId: 'ws-1',
        userId: 'user-1',
        action: 'contact.created',
        resourceType: 'contact',
        resourceId: 'ct-1',
        details: undefined,
      });
    });

    it('logs contact deletion', async () => {
      const mgr = createManager('owner');
      vi.mocked(contactAdapter.deleteContact).mockResolvedValue();

      await mgr.deleteContact('ct-1');

      expect(teamsAdapter.createAuditEntry).toHaveBeenCalledWith({
        workspaceId: 'ws-1',
        userId: 'user-1',
        action: 'contact.deleted',
        resourceType: 'contact',
        resourceId: 'ct-1',
        details: undefined,
      });
    });

    it('logs bulk import with counts', async () => {
      const mgr = createManager('editor');
      vi.mocked(contactAdapter.bulkCreateContacts).mockResolvedValue({ created: 5, updated: 2 });

      const contacts = Array.from({ length: 7 }, (_, i) => ({ email: `u${i}@test.com` }));
      await mgr.bulkCreateContacts(contacts);

      expect(teamsAdapter.createAuditEntry).toHaveBeenCalledWith({
        workspaceId: 'ws-1',
        userId: 'user-1',
        action: 'contact.bulk_import',
        resourceType: 'contact',
        resourceId: 'bulk',
        details: { created: 5, updated: 2, total: 7 },
      });
    });

    it('logs segment creation', async () => {
      const mgr = createManager('admin');
      vi.mocked(contactAdapter.createSegment).mockResolvedValue({
        id: 'seg-1',
        name: 'Active Users',
        rules: [],
        contactCount: 0,
        createdAt: '2026-01-01T00:00:00Z',
      });

      await mgr.createSegment('Active Users', []);

      expect(teamsAdapter.createAuditEntry).toHaveBeenCalledWith({
        workspaceId: 'ws-1',
        userId: 'user-1',
        action: 'segment.created',
        resourceType: 'contact',
        resourceId: 'seg-1',
        details: undefined,
      });
    });

    it('logs unsubscribe with details', async () => {
      const mgr = createManager('viewer');
      vi.mocked(contactAdapter.recordUnsubscribe).mockResolvedValue();

      await mgr.recordUnsubscribe('ct-1', 'No longer interested', 'link');

      expect(teamsAdapter.createAuditEntry).toHaveBeenCalledWith({
        workspaceId: 'ws-1',
        userId: 'user-1',
        action: 'contact.unsubscribed',
        resourceType: 'contact',
        resourceId: 'ct-1',
        details: { reason: 'No longer interested', method: 'link' },
      });
    });
  });

  // --- Passthrough operations ---

  describe('passthrough operations', () => {
    it('getContactByEmail delegates correctly', async () => {
      const mgr = createManager('admin');
      vi.mocked(contactAdapter.getContactByEmail).mockResolvedValue(createMockContact());

      const result = await mgr.getContactByEmail('test@example.com');
      expect(result?.email).toBe('test@example.com');
    });

    it('isUnsubscribed delegates without permission check', async () => {
      const mgr = createManager('viewer');
      vi.mocked(contactAdapter.isUnsubscribed).mockResolvedValue(true);

      expect(await mgr.isUnsubscribed('ct-1')).toBe(true);
    });

    it('getSegmentContacts requires view permission', async () => {
      const mgr = createManager('viewer');
      vi.mocked(contactAdapter.getSegmentContacts).mockResolvedValue({ data: [], total: 0 });

      await expect(mgr.getSegmentContacts('seg-1')).resolves.toBeDefined();
    });
  });
});
