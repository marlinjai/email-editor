import type { DatabaseAdapter, Row, CellValue } from '@marlinjai/data-table-core';
import type {
  Automation,
  AutomationStep,
  Enrollment,
  AutomationStorageAdapter,
  CreateAutomationInput,
  UpdateAutomationInput,
  AutomationListOptions,
  CreateStepInput,
  UpdateStepInput,
  CreateEnrollmentInput,
  UpdateEnrollmentInput,
  EnrollmentListOptions,
  AutomationStatus,
  AutomationTrigger,
  StepConfig,
  EnrollmentStatus,
} from './types';

export interface DatabaseAutomationAdapterConfig {
  adapter: DatabaseAdapter;
  automationsTableId: string;
  stepsTableId: string;
  enrollmentsTableId: string;
}

function parseJson<T>(val: unknown, fallback: T): T {
  if (!val) return fallback;
  try {
    return JSON.parse(String(val)) as T;
  } catch {
    return fallback;
  }
}

function rowToAutomation(row: Row): Automation {
  const c = row.cells;
  return {
    id: row.id,
    name: String(c.name ?? ''),
    description: c.description ? String(c.description) : undefined,
    status: String(c.status ?? 'draft') as AutomationStatus,
    trigger: parseJson<AutomationTrigger>(c.trigger, { type: 'manual' }),
    entryStepId: c.entry_step_id ? String(c.entry_step_id) : undefined,
    totalEnrolled: Number(c.total_enrolled ?? 0),
    totalCompleted: Number(c.total_completed ?? 0),
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : String(row.updatedAt),
  };
}

function rowToStep(row: Row): AutomationStep {
  const c = row.cells;
  return {
    id: row.id,
    automationId: String(c.automation_id ?? ''),
    position: Number(c.position ?? 0),
    config: parseJson<StepConfig>(c.config, { type: 'wait', delayMinutes: 0 }),
    nextStepId: c.next_step_id ? String(c.next_step_id) : undefined,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : String(row.updatedAt),
  };
}

function rowToEnrollment(row: Row): Enrollment {
  const c = row.cells;
  return {
    id: row.id,
    automationId: String(c.automation_id ?? ''),
    contactId: String(c.contact_id ?? ''),
    currentStepId: c.current_step_id ? String(c.current_step_id) : undefined,
    status: String(c.status ?? 'active') as EnrollmentStatus,
    enterredAt: String(c.enterred_at ?? row.createdAt),
    completedAt: c.completed_at ? String(c.completed_at) : undefined,
    nextActionAt: c.next_action_at ? String(c.next_action_at) : undefined,
    metadata: parseJson<Record<string, unknown> | undefined>(c.metadata, undefined),
  };
}

export class DatabaseAutomationAdapter implements AutomationStorageAdapter {
  private adapter: DatabaseAdapter;
  private automationsTableId: string;
  private stepsTableId: string;
  private enrollmentsTableId: string;

  constructor(config: DatabaseAutomationAdapterConfig) {
    this.adapter = config.adapter;
    this.automationsTableId = config.automationsTableId;
    this.stepsTableId = config.stepsTableId;
    this.enrollmentsTableId = config.enrollmentsTableId;
  }

  // ─── Automations ──────────────────────────────────────────

  async createAutomation(input: CreateAutomationInput): Promise<Automation> {
    const row = await this.adapter.createRow({
      tableId: this.automationsTableId,
      cells: {
        name: input.name,
        description: input.description ?? '',
        status: 'draft',
        trigger: JSON.stringify(input.trigger),
        entry_step_id: '',
        total_enrolled: 0,
        total_completed: 0,
      },
    });
    return rowToAutomation(row);
  }

  async getAutomation(id: string): Promise<Automation | null> {
    const row = await this.adapter.getRow(id);
    if (!row) return null;
    return rowToAutomation(row);
  }

  async listAutomations(options?: AutomationListOptions): Promise<{ data: Automation[]; total: number }> {
    const page = options?.page ?? 1;
    const pageSize = options?.pageSize ?? 50;
    const offset = (page - 1) * pageSize;

    const filters: Array<{ columnId: string; operator: string; value: unknown }> = [];
    if (options?.status) {
      filters.push({ columnId: 'status', operator: 'eq', value: options.status });
    }
    if (options?.search) {
      filters.push({ columnId: 'name', operator: 'contains', value: options.search });
    }

    const result = await this.adapter.getRows(this.automationsTableId, {
      limit: pageSize,
      offset,
      filters: filters as never,
    });

    return {
      data: result.items.map(rowToAutomation),
      total: result.total,
    };
  }

  async updateAutomation(id: string, input: UpdateAutomationInput): Promise<Automation> {
    const cells: Record<string, CellValue> = {};
    if (input.name !== undefined) cells.name = input.name;
    if (input.description !== undefined) cells.description = input.description;
    if (input.status !== undefined) cells.status = input.status;
    if (input.trigger !== undefined) cells.trigger = JSON.stringify(input.trigger);
    if (input.entryStepId !== undefined) cells.entry_step_id = input.entryStepId;
    if (input.totalEnrolled !== undefined) cells.total_enrolled = input.totalEnrolled;
    if (input.totalCompleted !== undefined) cells.total_completed = input.totalCompleted;

    const row = await this.adapter.updateRow(id, cells);
    return rowToAutomation(row);
  }

  async deleteAutomation(id: string): Promise<void> {
    await this.adapter.deleteRow(id);
  }

  // ─── Steps ────────────────────────────────────────────────

  async createStep(input: CreateStepInput): Promise<AutomationStep> {
    const row = await this.adapter.createRow({
      tableId: this.stepsTableId,
      cells: {
        automation_id: input.automationId,
        position: input.position,
        config: JSON.stringify(input.config),
        next_step_id: input.nextStepId ?? '',
      },
    });
    return rowToStep(row);
  }

  async getStep(id: string): Promise<AutomationStep | null> {
    const row = await this.adapter.getRow(id);
    if (!row) return null;
    return rowToStep(row);
  }

  async listSteps(automationId: string): Promise<AutomationStep[]> {
    const result = await this.adapter.getRows(this.stepsTableId, {
      limit: 200,
      offset: 0,
      filters: [{ columnId: 'automation_id', operator: 'eq', value: automationId }] as never,
    });
    return result.items.map(rowToStep).sort((a, b) => a.position - b.position);
  }

  async updateStep(id: string, input: UpdateStepInput): Promise<AutomationStep> {
    const cells: Record<string, CellValue> = {};
    if (input.position !== undefined) cells.position = input.position;
    if (input.config !== undefined) cells.config = JSON.stringify(input.config);
    if (input.nextStepId !== undefined) cells.next_step_id = input.nextStepId;

    const row = await this.adapter.updateRow(id, cells);
    return rowToStep(row);
  }

  async deleteStep(id: string): Promise<void> {
    await this.adapter.deleteRow(id);
  }

  // ─── Enrollments ──────────────────────────────────────────

  async createEnrollment(input: CreateEnrollmentInput): Promise<Enrollment> {
    const row = await this.adapter.createRow({
      tableId: this.enrollmentsTableId,
      cells: {
        automation_id: input.automationId,
        contact_id: input.contactId,
        current_step_id: input.currentStepId ?? '',
        status: 'active',
        enterred_at: new Date().toISOString(),
        completed_at: '',
        next_action_at: input.nextActionAt ?? '',
        metadata: input.metadata ? JSON.stringify(input.metadata) : '',
      },
    });
    return rowToEnrollment(row);
  }

  async getEnrollment(id: string): Promise<Enrollment | null> {
    const row = await this.adapter.getRow(id);
    if (!row) return null;
    return rowToEnrollment(row);
  }

  async getEnrollmentByContact(automationId: string, contactId: string): Promise<Enrollment | null> {
    const result = await this.adapter.getRows(this.enrollmentsTableId, {
      limit: 1,
      offset: 0,
      filters: [
        { columnId: 'automation_id', operator: 'eq', value: automationId },
        { columnId: 'contact_id', operator: 'eq', value: contactId },
      ] as never,
    });
    if (result.items.length === 0) return null;
    return rowToEnrollment(result.items[0]);
  }

  async listEnrollments(
    automationId: string,
    options?: EnrollmentListOptions
  ): Promise<{ data: Enrollment[]; total: number }> {
    const page = options?.page ?? 1;
    const pageSize = options?.pageSize ?? 50;
    const offset = (page - 1) * pageSize;

    const filters: Array<{ columnId: string; operator: string; value: unknown }> = [
      { columnId: 'automation_id', operator: 'eq', value: automationId },
    ];
    if (options?.status) {
      filters.push({ columnId: 'status', operator: 'eq', value: options.status });
    }

    const result = await this.adapter.getRows(this.enrollmentsTableId, {
      limit: pageSize,
      offset,
      filters: filters as never,
    });

    return {
      data: result.items.map(rowToEnrollment),
      total: result.total,
    };
  }

  async updateEnrollment(id: string, input: UpdateEnrollmentInput): Promise<Enrollment> {
    const cells: Record<string, CellValue> = {};
    if (input.currentStepId !== undefined) cells.current_step_id = input.currentStepId ?? '';
    if (input.status !== undefined) cells.status = input.status;
    if (input.completedAt !== undefined) cells.completed_at = input.completedAt;
    if (input.nextActionAt !== undefined) cells.next_action_at = input.nextActionAt ?? '';
    if (input.metadata !== undefined) cells.metadata = JSON.stringify(input.metadata);

    const row = await this.adapter.updateRow(id, cells);
    return rowToEnrollment(row);
  }

  async getEnrollmentsDueForAction(before: string): Promise<Enrollment[]> {
    const result = await this.adapter.getRows(this.enrollmentsTableId, {
      limit: 200,
      offset: 0,
      filters: [
        { columnId: 'status', operator: 'eq', value: 'active' },
        { columnId: 'next_action_at', operator: 'lte', value: before },
      ] as never,
    });
    // Filter out entries with empty next_action_at
    return result.items
      .map(rowToEnrollment)
      .filter((e) => e.nextActionAt && e.nextActionAt <= before);
  }
}
