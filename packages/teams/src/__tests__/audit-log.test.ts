import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuditLogger } from '../audit-log';
import type { TeamsStorageAdapter } from '../adapter';
import type { AuditLogEntry } from '../types';

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

describe('AuditLogger', () => {
  let adapter: TeamsStorageAdapter;
  let logger: AuditLogger;

  beforeEach(() => {
    adapter = createMockAdapter();
    logger = new AuditLogger(adapter);
  });

  describe('log', () => {
    it('creates an audit entry', async () => {
      const entry: AuditLogEntry = {
        id: '1',
        workspaceId: 'ws-1',
        userId: 'user-1',
        action: 'template.created',
        resourceType: 'template',
        resourceId: 'tpl-1',
        occurredAt: '2026-01-01T00:00:00Z',
      };
      vi.mocked(adapter.createAuditEntry).mockResolvedValue(entry);

      const result = await logger.log('ws-1', 'user-1', 'template.created', 'template', 'tpl-1');
      expect(result).toEqual(entry);
      expect(adapter.createAuditEntry).toHaveBeenCalledWith({
        workspaceId: 'ws-1',
        userId: 'user-1',
        action: 'template.created',
        resourceType: 'template',
        resourceId: 'tpl-1',
        details: undefined,
      });
    });

    it('passes details through', async () => {
      const entry: AuditLogEntry = {
        id: '2',
        workspaceId: 'ws-1',
        userId: 'user-1',
        action: 'member.invited',
        resourceType: 'member',
        resourceId: 'member-2',
        details: { email: 'test@example.com', role: 'editor' },
        occurredAt: '2026-01-01T00:00:00Z',
      };
      vi.mocked(adapter.createAuditEntry).mockResolvedValue(entry);

      const result = await logger.log(
        'ws-1',
        'user-1',
        'member.invited',
        'member',
        'member-2',
        { email: 'test@example.com', role: 'editor' }
      );
      expect(result.details).toEqual({ email: 'test@example.com', role: 'editor' });
    });
  });

  describe('query', () => {
    it('queries with filters', async () => {
      vi.mocked(adapter.queryAuditLog).mockResolvedValue({ data: [], total: 0 });

      await logger.query('ws-1', {
        userId: 'user-1',
        action: 'template.created',
        page: 1,
        pageSize: 20,
      });

      expect(adapter.queryAuditLog).toHaveBeenCalledWith('ws-1', {
        userId: 'user-1',
        action: 'template.created',
        page: 1,
        pageSize: 20,
      });
    });

    it('queries with date range', async () => {
      vi.mocked(adapter.queryAuditLog).mockResolvedValue({ data: [], total: 0 });

      await logger.query('ws-1', {
        startDate: '2026-01-01',
        endDate: '2026-01-31',
      });

      expect(adapter.queryAuditLog).toHaveBeenCalledWith('ws-1', {
        startDate: '2026-01-01',
        endDate: '2026-01-31',
      });
    });

    it('returns data and total', async () => {
      const entries: AuditLogEntry[] = [
        {
          id: '1',
          workspaceId: 'ws-1',
          userId: 'user-1',
          action: 'template.created',
          resourceType: 'template',
          resourceId: 'tpl-1',
          occurredAt: '2026-01-01T00:00:00Z',
        },
      ];
      vi.mocked(adapter.queryAuditLog).mockResolvedValue({ data: entries, total: 1 });

      const result = await logger.query('ws-1');
      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
    });
  });
});
