// ─── Automation Status ──────────────────────────────────────────

export type AutomationStatus = 'draft' | 'active' | 'paused' | 'archived';

// ─── Trigger Types ──────────────────────────────────────────────

export type TriggerType = 'event' | 'schedule' | 'manual';

export interface EventTrigger {
  type: 'event';
  eventName: string; // e.g. 'purchase', 'signup', 'tag_added', 'form_submitted'
  filters?: Record<string, string>; // optional filters on event data
}

export interface ScheduleTrigger {
  type: 'schedule';
  scheduleType: 'delay_after_enrollment' | 'fixed_date' | 'recurring';
  delayMinutes?: number; // for delay_after_enrollment
  fixedDate?: string; // ISO 8601 for fixed_date
  cronExpression?: string; // for recurring
}

export interface ManualTrigger {
  type: 'manual';
}

export type AutomationTrigger = EventTrigger | ScheduleTrigger | ManualTrigger;

// ─── Step Types ─────────────────────────────────────────────────

export type StepType = 'send_email' | 'wait' | 'condition' | 'split';

export interface SendEmailStep {
  type: 'send_email';
  templateId: string;
  subject?: string; // override
  fromName?: string;
  fromEmail?: string;
}

export interface WaitStep {
  type: 'wait';
  delayMinutes: number;
}

export interface ConditionBranch {
  id: string;
  label: string;
  rules: ConditionRule[];
  nextStepId?: string;
}

export interface ConditionRule {
  field: string; // 'contact.tags', 'contact.customFields.plan', 'engagement.opened', etc.
  operator: 'equals' | 'not_equals' | 'contains' | 'not_contains' | 'greater_than' | 'less_than' | 'is_true' | 'is_false';
  value: string;
}

export interface ConditionStep {
  type: 'condition';
  branches: ConditionBranch[];
  defaultNextStepId?: string; // fallback if no branch matches
}

export interface SplitVariant {
  id: string;
  label: string;
  percentage: number;
  nextStepId?: string;
}

export interface SplitStep {
  type: 'split';
  variants: SplitVariant[];
}

export type StepConfig = SendEmailStep | WaitStep | ConditionStep | SplitStep;

// ─── Automation Step ────────────────────────────────────────────

export interface AutomationStep {
  id: string;
  automationId: string;
  position: number;
  config: StepConfig;
  nextStepId?: string; // for linear flows (send_email, wait)
  createdAt: string;
  updatedAt: string;
}

// ─── Automation ─────────────────────────────────────────────────

export interface Automation {
  id: string;
  name: string;
  description?: string;
  status: AutomationStatus;
  trigger: AutomationTrigger;
  entryStepId?: string;
  totalEnrolled: number;
  totalCompleted: number;
  createdAt: string;
  updatedAt: string;
}

// ─── Enrollment ─────────────────────────────────────────────────

export type EnrollmentStatus = 'active' | 'completed' | 'failed' | 'paused' | 'exited';

export interface Enrollment {
  id: string;
  automationId: string;
  contactId: string;
  currentStepId?: string;
  status: EnrollmentStatus;
  enterredAt: string;
  completedAt?: string;
  nextActionAt?: string; // when the next step should execute (for wait steps)
  metadata?: Record<string, unknown>;
}

// ─── Webhook Event ──────────────────────────────────────────────

export interface WebhookEvent {
  eventName: string;
  contactId?: string;
  contactEmail?: string;
  data?: Record<string, unknown>;
  occurredAt: string;
}

// ─── Storage Adapter ────────────────────────────────────────────

export interface AutomationStorageAdapter {
  // Automations
  createAutomation(input: CreateAutomationInput): Promise<Automation>;
  getAutomation(id: string): Promise<Automation | null>;
  listAutomations(options?: AutomationListOptions): Promise<{ data: Automation[]; total: number }>;
  updateAutomation(id: string, input: UpdateAutomationInput): Promise<Automation>;
  deleteAutomation(id: string): Promise<void>;

  // Steps
  createStep(input: CreateStepInput): Promise<AutomationStep>;
  getStep(id: string): Promise<AutomationStep | null>;
  listSteps(automationId: string): Promise<AutomationStep[]>;
  updateStep(id: string, input: UpdateStepInput): Promise<AutomationStep>;
  deleteStep(id: string): Promise<void>;

  // Enrollments
  createEnrollment(input: CreateEnrollmentInput): Promise<Enrollment>;
  getEnrollment(id: string): Promise<Enrollment | null>;
  getEnrollmentByContact(automationId: string, contactId: string): Promise<Enrollment | null>;
  listEnrollments(automationId: string, options?: EnrollmentListOptions): Promise<{ data: Enrollment[]; total: number }>;
  updateEnrollment(id: string, input: UpdateEnrollmentInput): Promise<Enrollment>;
  getEnrollmentsDueForAction(before: string): Promise<Enrollment[]>;
}

// ─── Input Types ────────────────────────────────────────────────

export interface CreateAutomationInput {
  name: string;
  description?: string;
  trigger: AutomationTrigger;
}

export interface UpdateAutomationInput {
  name?: string;
  description?: string;
  status?: AutomationStatus;
  trigger?: AutomationTrigger;
  entryStepId?: string;
  totalEnrolled?: number;
  totalCompleted?: number;
}

export interface CreateStepInput {
  automationId: string;
  position: number;
  config: StepConfig;
  nextStepId?: string;
}

export interface UpdateStepInput {
  position?: number;
  config?: StepConfig;
  nextStepId?: string;
}

export interface CreateEnrollmentInput {
  automationId: string;
  contactId: string;
  currentStepId?: string;
  nextActionAt?: string;
  metadata?: Record<string, unknown>;
}

export interface UpdateEnrollmentInput {
  currentStepId?: string;
  status?: EnrollmentStatus;
  completedAt?: string;
  nextActionAt?: string;
  metadata?: Record<string, unknown>;
}

export interface AutomationListOptions {
  status?: AutomationStatus;
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface EnrollmentListOptions {
  status?: EnrollmentStatus;
  page?: number;
  pageSize?: number;
}
