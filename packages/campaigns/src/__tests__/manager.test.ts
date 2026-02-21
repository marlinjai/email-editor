import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CampaignManager } from '../manager';
import type {
  Campaign,
  CampaignStorageAdapter,
  SendAdapter,
  SendResult,
} from '../types';
import type { ContactStorageAdapter, Contact } from '@marlinjai/email-contacts';
import type { TemplateStorageAdapter, Template } from '@marlinjai/email-templates';

function makeCampaign(overrides?: Partial<Campaign>): Campaign {
  return {
    id: 'camp1',
    name: 'Test Campaign',
    templateId: 'tmpl1',
    status: 'draft',
    subject: 'Hello {{first_name}}',
    fromName: 'Test',
    fromEmail: 'test@example.com',
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeContact(id: string, email: string): Contact {
  return {
    id,
    email,
    firstName: 'John',
    lastName: 'Doe',
    status: 'active',
    tags: [],
    customFields: {},
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  };
}

function makeTemplate(): Template {
  return {
    id: 'tmpl1',
    name: 'Test Template',
    tags: [],
    status: 'active',
    templateJson: '<html><body><p>Hello {{first_name}}</p></body></html>',
    version: 1,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  };
}

describe('CampaignManager', () => {
  let adapter: CampaignStorageAdapter;
  let contactAdapter: ContactStorageAdapter;
  let templateAdapter: TemplateStorageAdapter;
  let sendAdapter: SendAdapter;
  let manager: CampaignManager;

  beforeEach(() => {
    adapter = {
      createCampaign: vi.fn().mockResolvedValue(makeCampaign()),
      getCampaign: vi.fn().mockResolvedValue(makeCampaign()),
      listCampaigns: vi.fn().mockResolvedValue({ data: [makeCampaign()], total: 1 }),
      updateCampaign: vi.fn().mockImplementation(async (id, updates) =>
        makeCampaign({ id, ...updates }),
      ),
      deleteCampaign: vi.fn().mockResolvedValue(undefined),
      createRecipient: vi.fn().mockResolvedValue({
        id: 'r1',
        campaignId: 'camp1',
        contactId: 'c1',
        email: 'john@example.com',
        status: 'pending',
      }),
      listRecipients: vi.fn().mockResolvedValue({ data: [], total: 0 }),
      updateRecipientStatus: vi.fn().mockResolvedValue(undefined),
      bulkCreateRecipients: vi.fn().mockResolvedValue(2),
    };

    contactAdapter = {
      listContacts: vi.fn().mockResolvedValue({
        data: [
          makeContact('c1', 'john@example.com'),
          makeContact('c2', 'jane@example.com'),
        ],
        total: 2,
      }),
      getSegmentContacts: vi.fn().mockResolvedValue({
        data: [makeContact('c1', 'john@example.com')],
        total: 1,
      }),
    } as unknown as ContactStorageAdapter;

    templateAdapter = {
      getTemplate: vi.fn().mockResolvedValue(makeTemplate()),
    } as unknown as TemplateStorageAdapter;

    const successResult: SendResult = { success: true, messageId: 'msg-123' };
    sendAdapter = {
      send: vi.fn().mockResolvedValue(successResult),
      sendBatch: vi.fn().mockResolvedValue({
        results: [successResult, successResult],
        totalSent: 2,
        totalFailed: 0,
      }),
    };

    manager = new CampaignManager({
      adapter,
      contactAdapter,
      templateAdapter,
      sendAdapter,
    });
  });

  describe('createCampaign', () => {
    it('should create a campaign with valid input', async () => {
      const result = await manager.createCampaign({
        name: 'Test Campaign',
        templateId: 'tmpl1',
        subject: 'Hello',
        fromName: 'Test',
        fromEmail: 'test@example.com',
      });
      expect(result.id).toBe('camp1');
      expect(adapter.createCampaign).toHaveBeenCalled();
    });

    it('should reject invalid input', async () => {
      await expect(
        manager.createCampaign({
          name: '',
          templateId: 'tmpl1',
          subject: 'Hello',
          fromName: 'Test',
          fromEmail: 'test@example.com',
        }),
      ).rejects.toThrow();
    });

    it('should reject invalid email', async () => {
      await expect(
        manager.createCampaign({
          name: 'Test',
          templateId: 'tmpl1',
          subject: 'Hello',
          fromName: 'Test',
          fromEmail: 'not-an-email',
        }),
      ).rejects.toThrow();
    });
  });

  describe('updateCampaign', () => {
    it('should update a draft campaign', async () => {
      const result = await manager.updateCampaign('camp1', { name: 'Updated' });
      expect(result.name).toBe('Updated');
    });

    it('should reject updating non-draft campaign', async () => {
      (adapter.getCampaign as ReturnType<typeof vi.fn>).mockResolvedValue(
        makeCampaign({ status: 'sent' }),
      );
      await expect(manager.updateCampaign('camp1', { name: 'Updated' })).rejects.toThrow(
        'Only draft campaigns can be updated',
      );
    });

    it('should throw if campaign not found', async () => {
      (adapter.getCampaign as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      await expect(manager.updateCampaign('missing', {})).rejects.toThrow('not found');
    });
  });

  describe('scheduleCampaign', () => {
    it('should schedule a draft campaign', async () => {
      const result = await manager.scheduleCampaign('camp1', {
        scheduledAt: '2024-12-25T10:00:00Z',
      });
      expect(result.status).toBe('scheduled');
      expect(adapter.updateCampaign).toHaveBeenCalledWith('camp1', expect.objectContaining({ status: 'scheduled' }));
    });

    it('should reject scheduling non-draft campaign', async () => {
      (adapter.getCampaign as ReturnType<typeof vi.fn>).mockResolvedValue(
        makeCampaign({ status: 'sent' }),
      );
      await expect(
        manager.scheduleCampaign('camp1', { scheduledAt: '2024-12-25T10:00:00Z' }),
      ).rejects.toThrow('Only draft campaigns can be scheduled');
    });
  });

  describe('cancelCampaign', () => {
    it('should cancel a scheduled campaign', async () => {
      (adapter.getCampaign as ReturnType<typeof vi.fn>).mockResolvedValue(
        makeCampaign({ status: 'scheduled' }),
      );
      const result = await manager.cancelCampaign('camp1');
      expect(result.status).toBe('cancelled');
    });

    it('should reject cancelling a draft campaign', async () => {
      await expect(manager.cancelCampaign('camp1')).rejects.toThrow(
        'Only scheduled or sending campaigns can be cancelled',
      );
    });
  });

  describe('sendTestEmail', () => {
    it('should send a test email', async () => {
      const result = await manager.sendTestEmail('camp1', 'test@example.com');
      expect(result.success).toBe(true);
      expect(sendAdapter.send).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'test@example.com',
          subject: '[TEST] Hello {{first_name}}',
        }),
      );
    });
  });

  describe('sendCampaign', () => {
    it('should orchestrate full send flow', async () => {
      const result = await manager.sendCampaign('camp1');
      expect(result.status).toBe('sent');
      expect(adapter.bulkCreateRecipients).toHaveBeenCalled();
      expect(sendAdapter.sendBatch).toHaveBeenCalled();
      expect(adapter.updateCampaign).toHaveBeenCalledWith(
        'camp1',
        expect.objectContaining({ status: 'sent' }),
      );
    });

    it('should use segment contacts when segmentId is set', async () => {
      (adapter.getCampaign as ReturnType<typeof vi.fn>).mockResolvedValue(
        makeCampaign({ segmentId: 'seg1' }),
      );
      await manager.sendCampaign('camp1');
      expect(contactAdapter.getSegmentContacts).toHaveBeenCalledWith('seg1', expect.anything());
    });

    it('should mark as failed if send throws', async () => {
      (sendAdapter.sendBatch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Network error'));
      await expect(manager.sendCampaign('camp1')).rejects.toThrow('Network error');
      expect(adapter.updateCampaign).toHaveBeenCalledWith(
        'camp1',
        expect.objectContaining({ status: 'failed' }),
      );
    });

    it('should reject sending non-draft/scheduled campaign', async () => {
      (adapter.getCampaign as ReturnType<typeof vi.fn>).mockResolvedValue(
        makeCampaign({ status: 'sent' }),
      );
      await expect(manager.sendCampaign('camp1')).rejects.toThrow(
        'Campaign must be in draft or scheduled status',
      );
    });
  });

  describe('deleteCampaign', () => {
    it('should delete a draft campaign', async () => {
      await manager.deleteCampaign('camp1');
      expect(adapter.deleteCampaign).toHaveBeenCalledWith('camp1');
    });

    it('should reject deleting a sending campaign', async () => {
      (adapter.getCampaign as ReturnType<typeof vi.fn>).mockResolvedValue(
        makeCampaign({ status: 'sending' }),
      );
      await expect(manager.deleteCampaign('camp1')).rejects.toThrow(
        'Cannot delete a campaign that is currently sending',
      );
    });
  });
});
