import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AutomationEngine } from '../engine';
import type { AutomationStorageAdapter, Automation, AutomationStep, Enrollment } from '../types';
import type { ContactStorageAdapter, Contact } from '@marlinjai/email-contacts';
import type { SendAdapter } from '@marlinjai/email-campaigns';

function mockContact(id = 'contact-1'): Contact {
  return {
    id,
    email: 'alice@example.com',
    firstName: 'Alice',
    status: 'active',
    tags: ['vip'],
    customFields: {},
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-06-01T00:00:00Z',
  };
}

function mockAutomation(overrides?: Partial<Automation>): Automation {
  return {
    id: 'auto-1',
    name: 'Welcome Sequence',
    status: 'active',
    trigger: { type: 'event', eventName: 'signup' },
    entryStepId: 'step-1',
    totalEnrolled: 0,
    totalCompleted: 0,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

function mockStep(overrides?: Partial<AutomationStep>): AutomationStep {
  return {
    id: 'step-1',
    automationId: 'auto-1',
    position: 0,
    config: { type: 'send_email', templateId: 'tpl-1', subject: 'Welcome!' },
    nextStepId: 'step-2',
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

function mockEnrollment(overrides?: Partial<Enrollment>): Enrollment {
  return {
    id: 'enr-1',
    automationId: 'auto-1',
    contactId: 'contact-1',
    currentStepId: 'step-1',
    status: 'active',
    enterredAt: '2024-06-01T00:00:00Z',
    ...overrides,
  };
}

function createMockAdapter(): AutomationStorageAdapter {
  return {
    createAutomation: vi.fn(),
    getAutomation: vi.fn(),
    listAutomations: vi.fn().mockResolvedValue({ data: [], total: 0 }),
    updateAutomation: vi.fn().mockImplementation((_id, input) => Promise.resolve({ ...mockAutomation(), ...input })),
    deleteAutomation: vi.fn(),
    createStep: vi.fn(),
    getStep: vi.fn(),
    listSteps: vi.fn().mockResolvedValue([]),
    updateStep: vi.fn(),
    deleteStep: vi.fn(),
    createEnrollment: vi.fn(),
    getEnrollment: vi.fn(),
    getEnrollmentByContact: vi.fn(),
    listEnrollments: vi.fn().mockResolvedValue({ data: [], total: 0 }),
    updateEnrollment: vi.fn().mockImplementation((_id, input) => Promise.resolve({ ...mockEnrollment(), ...input })),
    getEnrollmentsDueForAction: vi.fn().mockResolvedValue([]),
  };
}

function createMockContactAdapter(): ContactStorageAdapter {
  return {
    createContact: vi.fn(),
    getContact: vi.fn().mockResolvedValue(mockContact()),
    getContactByEmail: vi.fn().mockResolvedValue(mockContact()),
    listContacts: vi.fn().mockResolvedValue({ data: [], total: 0 }),
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

function createMockSendAdapter(): SendAdapter {
  return {
    send: vi.fn().mockResolvedValue({ success: true, messageId: 'msg-1' }),
    sendBatch: vi.fn().mockResolvedValue({ results: [], totalSent: 0, totalFailed: 0 }),
  };
}

describe('AutomationEngine', () => {
  let adapter: AutomationStorageAdapter;
  let contactAdapter: ContactStorageAdapter;
  let sendAdapter: SendAdapter;
  let engine: AutomationEngine;

  beforeEach(() => {
    adapter = createMockAdapter();
    contactAdapter = createMockContactAdapter();
    sendAdapter = createMockSendAdapter();
    engine = new AutomationEngine({ adapter, contactAdapter, sendAdapter });
  });

  describe('createAutomation', () => {
    it('delegates to adapter', async () => {
      const input = { name: 'Test', trigger: { type: 'manual' as const } };
      (adapter.createAutomation as ReturnType<typeof vi.fn>).mockResolvedValue(mockAutomation({ name: 'Test' }));

      const result = await engine.createAutomation(input);
      expect(adapter.createAutomation).toHaveBeenCalledWith(input);
      expect(result.name).toBe('Test');
    });
  });

  describe('deleteAutomation', () => {
    it('throws when automation not found', async () => {
      (adapter.getAutomation as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      await expect(engine.deleteAutomation('x')).rejects.toThrow('not found');
    });

    it('throws when automation is active', async () => {
      (adapter.getAutomation as ReturnType<typeof vi.fn>).mockResolvedValue(mockAutomation({ status: 'active' }));
      await expect(engine.deleteAutomation('auto-1')).rejects.toThrow('Cannot delete an active automation');
    });

    it('deletes a draft automation', async () => {
      (adapter.getAutomation as ReturnType<typeof vi.fn>).mockResolvedValue(mockAutomation({ status: 'draft' }));
      await engine.deleteAutomation('auto-1');
      expect(adapter.deleteAutomation).toHaveBeenCalledWith('auto-1');
    });
  });

  describe('activateAutomation', () => {
    it('throws without entry step', async () => {
      (adapter.getAutomation as ReturnType<typeof vi.fn>).mockResolvedValue(mockAutomation({ entryStepId: undefined }));
      await expect(engine.activateAutomation('auto-1')).rejects.toThrow('at least one step');
    });

    it('activates automation with entry step', async () => {
      (adapter.getAutomation as ReturnType<typeof vi.fn>).mockResolvedValue(mockAutomation());
      await engine.activateAutomation('auto-1');
      expect(adapter.updateAutomation).toHaveBeenCalledWith('auto-1', { status: 'active' });
    });
  });

  describe('addStep', () => {
    it('creates first step and sets as entry', async () => {
      (adapter.listSteps as ReturnType<typeof vi.fn>).mockResolvedValue([]);
      (adapter.createStep as ReturnType<typeof vi.fn>).mockResolvedValue(mockStep());

      await engine.addStep('auto-1', { type: 'send_email', templateId: 'tpl-1' });
      expect(adapter.createStep).toHaveBeenCalledWith({
        automationId: 'auto-1',
        position: 0,
        config: { type: 'send_email', templateId: 'tpl-1' },
        nextStepId: undefined,
      });
      expect(adapter.updateAutomation).toHaveBeenCalledWith('auto-1', { entryStepId: 'step-1' });
    });

    it('appends step at correct position', async () => {
      (adapter.listSteps as ReturnType<typeof vi.fn>).mockResolvedValue([mockStep(), mockStep({ id: 'step-2', position: 1 })]);
      (adapter.createStep as ReturnType<typeof vi.fn>).mockResolvedValue(mockStep({ id: 'step-3', position: 2 }));

      const result = await engine.addStep('auto-1', { type: 'wait', delayMinutes: 60 });
      expect(adapter.createStep).toHaveBeenCalledWith(expect.objectContaining({ position: 2 }));
      expect(result.id).toBe('step-3');
    });
  });

  describe('enrollContact', () => {
    it('enrolls a contact in an active automation', async () => {
      (adapter.getAutomation as ReturnType<typeof vi.fn>).mockResolvedValue(mockAutomation());
      (adapter.getEnrollmentByContact as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      (adapter.createEnrollment as ReturnType<typeof vi.fn>).mockResolvedValue(mockEnrollment());

      const result = await engine.enrollContact('auto-1', 'contact-1');
      expect(adapter.createEnrollment).toHaveBeenCalledWith({
        automationId: 'auto-1',
        contactId: 'contact-1',
        currentStepId: 'step-1',
        metadata: undefined,
      });
      expect(result.status).toBe('active');
    });

    it('rejects enrollment in non-active automation', async () => {
      (adapter.getAutomation as ReturnType<typeof vi.fn>).mockResolvedValue(mockAutomation({ status: 'draft' }));
      await expect(engine.enrollContact('auto-1', 'contact-1')).rejects.toThrow('active automations');
    });

    it('rejects duplicate active enrollment', async () => {
      (adapter.getAutomation as ReturnType<typeof vi.fn>).mockResolvedValue(mockAutomation());
      (adapter.getEnrollmentByContact as ReturnType<typeof vi.fn>).mockResolvedValue(mockEnrollment());
      await expect(engine.enrollContact('auto-1', 'contact-1')).rejects.toThrow('already enrolled');
    });

    it('increments total enrolled count', async () => {
      (adapter.getAutomation as ReturnType<typeof vi.fn>).mockResolvedValue(mockAutomation({ totalEnrolled: 5 }));
      (adapter.getEnrollmentByContact as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      (adapter.createEnrollment as ReturnType<typeof vi.fn>).mockResolvedValue(mockEnrollment());

      await engine.enrollContact('auto-1', 'contact-1');
      expect(adapter.updateAutomation).toHaveBeenCalledWith('auto-1', { totalEnrolled: 6 });
    });
  });

  describe('executeStep', () => {
    it('executes send_email step and advances', async () => {
      (adapter.getEnrollment as ReturnType<typeof vi.fn>).mockResolvedValue(mockEnrollment());
      (adapter.getStep as ReturnType<typeof vi.fn>).mockResolvedValue(mockStep());

      await engine.executeStep('enr-1');

      expect(sendAdapter.send).toHaveBeenCalled();
      expect(adapter.updateEnrollment).toHaveBeenCalledWith('enr-1', {
        currentStepId: 'step-2',
        nextActionAt: undefined,
      });
    });

    it('executes wait step and sets nextActionAt', async () => {
      const waitStep = mockStep({
        config: { type: 'wait', delayMinutes: 60 },
        nextStepId: 'step-3',
      });
      (adapter.getEnrollment as ReturnType<typeof vi.fn>).mockResolvedValue(mockEnrollment());
      (adapter.getStep as ReturnType<typeof vi.fn>).mockResolvedValue(waitStep);

      await engine.executeStep('enr-1');

      expect(adapter.updateEnrollment).toHaveBeenCalledWith('enr-1', expect.objectContaining({
        currentStepId: 'step-3',
        nextActionAt: expect.any(String),
      }));
    });

    it('executes condition step and follows matching branch', async () => {
      const condStep = mockStep({
        config: {
          type: 'condition',
          branches: [
            {
              id: 'yes',
              label: 'VIP',
              rules: [{ field: 'contact.tags', operator: 'contains', value: 'vip' }],
              nextStepId: 'step-vip',
            },
          ],
          defaultNextStepId: 'step-default',
        },
      });
      (adapter.getEnrollment as ReturnType<typeof vi.fn>).mockResolvedValue(mockEnrollment());
      (adapter.getStep as ReturnType<typeof vi.fn>).mockResolvedValue(condStep);

      await engine.executeStep('enr-1');

      expect(adapter.updateEnrollment).toHaveBeenCalledWith('enr-1', {
        currentStepId: 'step-vip',
        nextActionAt: undefined,
      });
    });

    it('follows default branch when no condition matches', async () => {
      const condStep = mockStep({
        config: {
          type: 'condition',
          branches: [
            {
              id: 'enterprise',
              label: 'Enterprise',
              rules: [{ field: 'contact.customFields.plan', operator: 'equals', value: 'enterprise' }],
              nextStepId: 'step-enterprise',
            },
          ],
          defaultNextStepId: 'step-fallback',
        },
      });
      (adapter.getEnrollment as ReturnType<typeof vi.fn>).mockResolvedValue(mockEnrollment());
      (adapter.getStep as ReturnType<typeof vi.fn>).mockResolvedValue(condStep);

      await engine.executeStep('enr-1');

      expect(adapter.updateEnrollment).toHaveBeenCalledWith('enr-1', {
        currentStepId: 'step-fallback',
        nextActionAt: undefined,
      });
    });

    it('completes enrollment when no next step', async () => {
      const lastStep = mockStep({ nextStepId: undefined });
      (adapter.getEnrollment as ReturnType<typeof vi.fn>).mockResolvedValue(mockEnrollment());
      (adapter.getStep as ReturnType<typeof vi.fn>).mockResolvedValue(lastStep);
      (adapter.getAutomation as ReturnType<typeof vi.fn>).mockResolvedValue(mockAutomation({ totalCompleted: 2 }));

      await engine.executeStep('enr-1');

      expect(adapter.updateEnrollment).toHaveBeenCalledWith('enr-1', expect.objectContaining({
        status: 'completed',
        completedAt: expect.any(String),
      }));
      expect(adapter.updateAutomation).toHaveBeenCalledWith('auto-1', { totalCompleted: 3 });
    });

    it('fails enrollment when contact not found', async () => {
      (adapter.getEnrollment as ReturnType<typeof vi.fn>).mockResolvedValue(mockEnrollment());
      (adapter.getStep as ReturnType<typeof vi.fn>).mockResolvedValue(mockStep());
      (contactAdapter.getContact as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      await engine.executeStep('enr-1');

      expect(adapter.updateEnrollment).toHaveBeenCalledWith('enr-1', expect.objectContaining({
        status: 'failed',
      }));
    });

    it('throws for inactive enrollment', async () => {
      (adapter.getEnrollment as ReturnType<typeof vi.fn>).mockResolvedValue(mockEnrollment({ status: 'completed' }));
      await expect(engine.executeStep('enr-1')).rejects.toThrow('not active');
    });

    it('completes enrollment when currentStepId is null', async () => {
      (adapter.getEnrollment as ReturnType<typeof vi.fn>).mockResolvedValue(mockEnrollment({ currentStepId: undefined }));
      (adapter.getAutomation as ReturnType<typeof vi.fn>).mockResolvedValue(mockAutomation());

      await engine.executeStep('enr-1');
      expect(adapter.updateEnrollment).toHaveBeenCalledWith('enr-1', expect.objectContaining({
        status: 'completed',
      }));
    });
  });

  describe('handleWebhookEvent', () => {
    it('enrolls contact in matching automation', async () => {
      (adapter.listAutomations as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: [mockAutomation()],
        total: 1,
      });
      (adapter.getAutomation as ReturnType<typeof vi.fn>).mockResolvedValue(mockAutomation());
      (adapter.getEnrollmentByContact as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      (adapter.createEnrollment as ReturnType<typeof vi.fn>).mockResolvedValue(mockEnrollment());

      const enrollments = await engine.handleWebhookEvent({
        eventName: 'signup',
        contactId: 'contact-1',
        occurredAt: new Date().toISOString(),
      });

      expect(enrollments).toHaveLength(1);
    });

    it('resolves contact by email', async () => {
      (adapter.listAutomations as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: [mockAutomation()],
        total: 1,
      });
      (adapter.getAutomation as ReturnType<typeof vi.fn>).mockResolvedValue(mockAutomation());
      (adapter.getEnrollmentByContact as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      (adapter.createEnrollment as ReturnType<typeof vi.fn>).mockResolvedValue(mockEnrollment());

      await engine.handleWebhookEvent({
        eventName: 'signup',
        contactEmail: 'alice@example.com',
        occurredAt: new Date().toISOString(),
      });

      expect(contactAdapter.getContactByEmail).toHaveBeenCalledWith('alice@example.com');
    });

    it('returns empty array when no matching automations', async () => {
      (adapter.listAutomations as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [], total: 0 });

      const enrollments = await engine.handleWebhookEvent({
        eventName: 'unknown_event',
        contactId: 'contact-1',
        occurredAt: new Date().toISOString(),
      });

      expect(enrollments).toHaveLength(0);
    });

    it('returns empty when contact not found', async () => {
      (adapter.listAutomations as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: [mockAutomation()],
        total: 1,
      });
      (contactAdapter.getContact as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const enrollments = await engine.handleWebhookEvent({
        eventName: 'signup',
        contactId: 'unknown',
        occurredAt: new Date().toISOString(),
      });

      expect(enrollments).toHaveLength(0);
    });
  });

  describe('processQueue', () => {
    it('processes due enrollments', async () => {
      const dueEnrollment = mockEnrollment({ nextActionAt: '2024-01-01T00:00:00Z', currentStepId: 'step-2' });
      (adapter.getEnrollmentsDueForAction as ReturnType<typeof vi.fn>).mockResolvedValue([dueEnrollment]);
      (adapter.getEnrollment as ReturnType<typeof vi.fn>).mockResolvedValue(dueEnrollment);
      (adapter.getStep as ReturnType<typeof vi.fn>).mockResolvedValue(mockStep({ id: 'step-2' }));

      const processed = await engine.processQueue();
      expect(processed).toBe(1);
    });

    it('marks failed on errors', async () => {
      const dueEnrollment = mockEnrollment({ nextActionAt: '2024-01-01T00:00:00Z' });
      (adapter.getEnrollmentsDueForAction as ReturnType<typeof vi.fn>).mockResolvedValue([dueEnrollment]);
      (adapter.getEnrollment as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('fail'));

      const processed = await engine.processQueue();
      expect(processed).toBe(0);
      expect(adapter.updateEnrollment).toHaveBeenCalledWith('enr-1', expect.objectContaining({
        status: 'failed',
      }));
    });
  });

  describe('exitEnrollment', () => {
    it('marks enrollment as exited', async () => {
      await engine.exitEnrollment('enr-1');
      expect(adapter.updateEnrollment).toHaveBeenCalledWith('enr-1', expect.objectContaining({
        status: 'exited',
        completedAt: expect.any(String),
      }));
    });
  });
});
