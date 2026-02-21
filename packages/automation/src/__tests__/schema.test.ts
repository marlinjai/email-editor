import { describe, it, expect } from 'vitest';
import { AUTOMATION_TABLES } from '../schema';

describe('AUTOMATION_TABLES', () => {
  it('defines automations table', () => {
    expect(AUTOMATION_TABLES.automations.name).toBe('automations');
    const colNames = AUTOMATION_TABLES.automations.columns.map((c) => c.name);
    expect(colNames).toContain('name');
    expect(colNames).toContain('status');
    expect(colNames).toContain('trigger');
    expect(colNames).toContain('entry_step_id');
    expect(colNames).toContain('total_enrolled');
    expect(colNames).toContain('total_completed');
  });

  it('defines automation_steps table', () => {
    expect(AUTOMATION_TABLES.automation_steps.name).toBe('automation_steps');
    const colNames = AUTOMATION_TABLES.automation_steps.columns.map((c) => c.name);
    expect(colNames).toContain('automation_id');
    expect(colNames).toContain('position');
    expect(colNames).toContain('config');
    expect(colNames).toContain('next_step_id');
  });

  it('defines automation_enrollments table', () => {
    expect(AUTOMATION_TABLES.automation_enrollments.name).toBe('automation_enrollments');
    const colNames = AUTOMATION_TABLES.automation_enrollments.columns.map((c) => c.name);
    expect(colNames).toContain('automation_id');
    expect(colNames).toContain('contact_id');
    expect(colNames).toContain('current_step_id');
    expect(colNames).toContain('status');
    expect(colNames).toContain('next_action_at');
    expect(colNames).toContain('metadata');
  });

  it('automations status has correct options', () => {
    const statusCol = AUTOMATION_TABLES.automations.columns.find((c) => c.name === 'status');
    expect(statusCol).toBeDefined();
    expect(statusCol!.type).toBe('select');
  });

  it('enrollments status has correct options', () => {
    const statusCol = AUTOMATION_TABLES.automation_enrollments.columns.find((c) => c.name === 'status');
    expect(statusCol).toBeDefined();
    expect(statusCol!.type).toBe('select');
  });
});
