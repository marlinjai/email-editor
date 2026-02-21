export const AUTOMATION_TABLES = {
  automations: {
    name: 'automations',
    columns: [
      { name: 'name', type: 'text' as const, required: true },
      { name: 'description', type: 'text' as const },
      { name: 'status', type: 'select' as const, options: ['draft', 'active', 'paused', 'archived'] },
      { name: 'trigger', type: 'text' as const, required: true }, // JSON
      { name: 'entry_step_id', type: 'text' as const },
      { name: 'total_enrolled', type: 'number' as const },
      { name: 'total_completed', type: 'number' as const },
    ],
  },
  automation_steps: {
    name: 'automation_steps',
    columns: [
      { name: 'automation_id', type: 'text' as const, required: true },
      { name: 'position', type: 'number' as const, required: true },
      { name: 'config', type: 'text' as const, required: true }, // JSON
      { name: 'next_step_id', type: 'text' as const },
    ],
  },
  automation_enrollments: {
    name: 'automation_enrollments',
    columns: [
      { name: 'automation_id', type: 'text' as const, required: true },
      { name: 'contact_id', type: 'text' as const, required: true },
      { name: 'current_step_id', type: 'text' as const },
      { name: 'status', type: 'select' as const, options: ['active', 'completed', 'failed', 'paused', 'exited'] },
      { name: 'enterred_at', type: 'text' as const, required: true },
      { name: 'completed_at', type: 'text' as const },
      { name: 'next_action_at', type: 'text' as const },
      { name: 'metadata', type: 'text' as const }, // JSON
    ],
  },
} as const;
