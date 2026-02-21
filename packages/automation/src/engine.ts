import type {
  Automation,
  AutomationStep,
  AutomationStorageAdapter,
  Enrollment,
  CreateAutomationInput,
  UpdateAutomationInput,
  AutomationListOptions,
  StepConfig,
  SplitStep,
  ConditionStep,
  WebhookEvent,
} from './types';
import type { Contact, ContactStorageAdapter } from '@marlinjai/email-contacts';
import type { SendAdapter, SendOptions } from '@marlinjai/email-campaigns';
import { evaluateCondition, type EvaluationContext } from './condition-evaluator';

export interface AutomationEngineConfig {
  adapter: AutomationStorageAdapter;
  contactAdapter: ContactStorageAdapter;
  sendAdapter: SendAdapter;
  compileTemplate?: (templateJson: string) => { html: string; errors?: string[] };
  templateAdapter?: { getTemplate(id: string): Promise<{ templateJson: string } | null> };
}

export class AutomationEngine {
  private readonly adapter: AutomationStorageAdapter;
  private readonly contactAdapter: ContactStorageAdapter;
  private readonly sendAdapter: SendAdapter;
  private readonly compileTemplate?: (templateJson: string) => { html: string; errors?: string[] };
  private readonly templateAdapter?: { getTemplate(id: string): Promise<{ templateJson: string } | null> };

  constructor(config: AutomationEngineConfig) {
    this.adapter = config.adapter;
    this.contactAdapter = config.contactAdapter;
    this.sendAdapter = config.sendAdapter;
    this.compileTemplate = config.compileTemplate;
    this.templateAdapter = config.templateAdapter;
  }

  // ─── Automation CRUD ────────────────────────────────────────

  async createAutomation(input: CreateAutomationInput): Promise<Automation> {
    return this.adapter.createAutomation(input);
  }

  async getAutomation(id: string): Promise<Automation | null> {
    return this.adapter.getAutomation(id);
  }

  async listAutomations(options?: AutomationListOptions): Promise<{ data: Automation[]; total: number }> {
    return this.adapter.listAutomations(options);
  }

  async updateAutomation(id: string, input: UpdateAutomationInput): Promise<Automation> {
    return this.adapter.updateAutomation(id, input);
  }

  async deleteAutomation(id: string): Promise<void> {
    const automation = await this.adapter.getAutomation(id);
    if (!automation) throw new Error(`Automation ${id} not found`);
    if (automation.status === 'active') {
      throw new Error('Cannot delete an active automation. Pause or archive it first.');
    }
    return this.adapter.deleteAutomation(id);
  }

  async activateAutomation(id: string): Promise<Automation> {
    const automation = await this.adapter.getAutomation(id);
    if (!automation) throw new Error(`Automation ${id} not found`);
    if (!automation.entryStepId) {
      throw new Error('Automation must have at least one step before activation');
    }
    return this.adapter.updateAutomation(id, { status: 'active' });
  }

  async pauseAutomation(id: string): Promise<Automation> {
    return this.adapter.updateAutomation(id, { status: 'paused' });
  }

  // ─── Step Management ────────────────────────────────────────

  async addStep(automationId: string, config: StepConfig, nextStepId?: string): Promise<AutomationStep> {
    const existing = await this.adapter.listSteps(automationId);
    const position = existing.length;
    const step = await this.adapter.createStep({
      automationId,
      position,
      config,
      nextStepId,
    });

    // If this is the first step, set it as entry step
    if (position === 0) {
      await this.adapter.updateAutomation(automationId, { entryStepId: step.id });
    }

    return step;
  }

  async getSteps(automationId: string): Promise<AutomationStep[]> {
    return this.adapter.listSteps(automationId);
  }

  async updateStep(stepId: string, config: Partial<StepConfig>, nextStepId?: string): Promise<AutomationStep> {
    const step = await this.adapter.getStep(stepId);
    if (!step) throw new Error(`Step ${stepId} not found`);

    const mergedConfig = { ...step.config, ...config } as StepConfig;
    return this.adapter.updateStep(stepId, {
      config: mergedConfig,
      nextStepId,
    });
  }

  async removeStep(stepId: string): Promise<void> {
    return this.adapter.deleteStep(stepId);
  }

  // ─── Enrollment ─────────────────────────────────────────────

  async enrollContact(automationId: string, contactId: string, metadata?: Record<string, unknown>): Promise<Enrollment> {
    const automation = await this.adapter.getAutomation(automationId);
    if (!automation) throw new Error(`Automation ${automationId} not found`);
    if (automation.status !== 'active') {
      throw new Error('Can only enroll contacts in active automations');
    }

    // Check for existing enrollment
    const existing = await this.adapter.getEnrollmentByContact(automationId, contactId);
    if (existing && existing.status === 'active') {
      throw new Error('Contact is already enrolled in this automation');
    }

    const enrollment = await this.adapter.createEnrollment({
      automationId,
      contactId,
      currentStepId: automation.entryStepId,
      metadata,
    });

    // Update total enrolled
    await this.adapter.updateAutomation(automationId, {
      totalEnrolled: automation.totalEnrolled + 1,
    });

    return enrollment;
  }

  async getEnrollment(enrollmentId: string): Promise<Enrollment | null> {
    return this.adapter.getEnrollment(enrollmentId);
  }

  async listEnrollments(automationId: string, options?: { status?: Enrollment['status']; page?: number; pageSize?: number }) {
    return this.adapter.listEnrollments(automationId, options);
  }

  async exitEnrollment(enrollmentId: string): Promise<Enrollment> {
    return this.adapter.updateEnrollment(enrollmentId, {
      status: 'exited',
      completedAt: new Date().toISOString(),
    });
  }

  // ─── Step Execution ─────────────────────────────────────────

  /**
   * Execute the current step for an enrollment. Returns the updated enrollment.
   * This is the core execution loop for advancing contacts through sequences.
   */
  async executeStep(enrollmentId: string, context?: Partial<EvaluationContext>): Promise<Enrollment> {
    const enrollment = await this.adapter.getEnrollment(enrollmentId);
    if (!enrollment) throw new Error(`Enrollment ${enrollmentId} not found`);
    if (enrollment.status !== 'active') {
      throw new Error('Enrollment is not active');
    }
    if (!enrollment.currentStepId) {
      // No more steps — mark completed
      return this.completeEnrollment(enrollment);
    }

    const step = await this.adapter.getStep(enrollment.currentStepId);
    if (!step) {
      return this.completeEnrollment(enrollment);
    }

    const contact = await this.contactAdapter.getContact(enrollment.contactId);
    if (!contact) {
      return this.adapter.updateEnrollment(enrollmentId, {
        status: 'failed',
        completedAt: new Date().toISOString(),
      });
    }

    const evalCtx: EvaluationContext = {
      contact,
      engagement: context?.engagement,
      eventData: context?.eventData,
    };

    switch (step.config.type) {
      case 'send_email':
        return this.executeSendEmail(enrollment, step, contact);
      case 'wait':
        return this.executeWait(enrollment, step);
      case 'condition':
        return this.executeCondition(enrollment, step, evalCtx);
      case 'split':
        return this.executeSplit(enrollment, step);
      default:
        return this.completeEnrollment(enrollment);
    }
  }

  /**
   * Process all enrollments that are due for action (wait steps completed).
   * Call this on a schedule (e.g., every minute via cron).
   */
  async processQueue(): Promise<number> {
    const now = new Date().toISOString();
    const dueEnrollments = await this.adapter.getEnrollmentsDueForAction(now);
    let processed = 0;

    for (const enrollment of dueEnrollments) {
      try {
        await this.executeStep(enrollment.id);
        processed++;
      } catch {
        // Mark as failed on unrecoverable errors
        await this.adapter.updateEnrollment(enrollment.id, {
          status: 'failed',
          completedAt: new Date().toISOString(),
        });
      }
    }

    return processed;
  }

  // ─── Webhook / External Event Handling ──────────────────────

  /**
   * Handle an incoming webhook event. Finds automations triggered by this event
   * and enrolls the contact if applicable.
   */
  async handleWebhookEvent(event: WebhookEvent): Promise<Enrollment[]> {
    // Find active automations with matching event trigger
    const { data: automations } = await this.adapter.listAutomations({ status: 'active' });
    const matching = automations.filter(
      (a) => a.trigger.type === 'event' && a.trigger.eventName === event.eventName
    );

    if (matching.length === 0) return [];

    // Resolve contact
    let contact: Contact | null = null;
    if (event.contactId) {
      contact = await this.contactAdapter.getContact(event.contactId);
    } else if (event.contactEmail) {
      contact = await this.contactAdapter.getContactByEmail(event.contactEmail);
    }

    if (!contact) return [];

    const enrollments: Enrollment[] = [];
    for (const automation of matching) {
      try {
        const enrollment = await this.enrollContact(automation.id, contact.id, {
          triggerEvent: event.eventName,
          eventData: event.data,
        });
        enrollments.push(enrollment);
      } catch {
        // Skip if already enrolled or other issues
      }
    }

    return enrollments;
  }

  // ─── Private Step Executors ─────────────────────────────────

  private async executeSendEmail(
    enrollment: Enrollment,
    step: AutomationStep,
    contact: Contact
  ): Promise<Enrollment> {
    const config = step.config as { type: 'send_email'; templateId: string; subject?: string; fromName?: string; fromEmail?: string };

    let html = '';
    if (this.templateAdapter && this.compileTemplate) {
      const template = await this.templateAdapter.getTemplate(config.templateId);
      if (template) {
        const result = this.compileTemplate(template.templateJson);
        html = result.html;
      }
    }

    if (!html) {
      html = `<p>Email from automation step ${step.id}</p>`;
    }

    const sendOptions: SendOptions = {
      to: contact.email,
      from: {
        name: config.fromName ?? 'Automation',
        email: config.fromEmail ?? 'noreply@example.com',
      },
      subject: config.subject ?? 'Automated Email',
      html,
    };

    await this.sendAdapter.send(sendOptions);

    return this.advanceToNextStep(enrollment, step.nextStepId);
  }

  private async executeWait(enrollment: Enrollment, step: AutomationStep): Promise<Enrollment> {
    const config = step.config as { type: 'wait'; delayMinutes: number };
    const nextActionAt = new Date(Date.now() + config.delayMinutes * 60 * 1000).toISOString();

    // Set the next action time; processQueue will pick it up later
    return this.adapter.updateEnrollment(enrollment.id, {
      nextActionAt,
      currentStepId: step.nextStepId ?? undefined,
    });
  }

  private async executeCondition(
    enrollment: Enrollment,
    step: AutomationStep,
    ctx: EvaluationContext
  ): Promise<Enrollment> {
    const config = step.config as ConditionStep;
    const matchedBranch = evaluateCondition(config.branches, ctx);

    const nextStepId = matchedBranch?.nextStepId ?? config.defaultNextStepId;
    return this.advanceToNextStep(enrollment, nextStepId);
  }

  private async executeSplit(enrollment: Enrollment, step: AutomationStep): Promise<Enrollment> {
    const config = step.config as SplitStep;

    // Deterministic split based on enrollment ID hash
    const hash = simpleHash(enrollment.id);
    const normalized = (hash % 10000) / 100; // 0-99.99

    let cumulative = 0;
    let selectedVariant = config.variants[0];
    for (const variant of config.variants) {
      cumulative += variant.percentage;
      if (normalized < cumulative) {
        selectedVariant = variant;
        break;
      }
    }

    return this.advanceToNextStep(enrollment, selectedVariant?.nextStepId);
  }

  private async advanceToNextStep(enrollment: Enrollment, nextStepId?: string): Promise<Enrollment> {
    if (!nextStepId) {
      return this.completeEnrollment(enrollment);
    }

    return this.adapter.updateEnrollment(enrollment.id, {
      currentStepId: nextStepId,
      nextActionAt: undefined,
    });
  }

  private async completeEnrollment(enrollment: Enrollment): Promise<Enrollment> {
    const automation = await this.adapter.getAutomation(enrollment.automationId);
    if (automation) {
      await this.adapter.updateAutomation(enrollment.automationId, {
        totalCompleted: automation.totalCompleted + 1,
      });
    }

    return this.adapter.updateEnrollment(enrollment.id, {
      status: 'completed',
      currentStepId: undefined,
      completedAt: new Date().toISOString(),
    });
  }
}

function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return Math.abs(hash);
}
