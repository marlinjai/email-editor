export interface TableColumnDef {
  name: string;
  type: string;
  required?: boolean;
  options?: string[];
}

export interface TableSchemaDef {
  name: string;
  columns: TableColumnDef[];
}

export const TEAMS_TABLES: Record<string, TableSchemaDef> = {
  workspace_members: {
    name: 'workspace_members',
    columns: [
      { name: 'workspace_id', type: 'text', required: true },
      { name: 'user_id', type: 'text', required: true },
      { name: 'email', type: 'text', required: true },
      { name: 'name', type: 'text' },
      {
        name: 'role',
        type: 'select',
        options: ['owner', 'admin', 'editor', 'viewer'],
        required: true,
      },
      { name: 'accepted_at', type: 'text' },
    ],
  },
  approval_requests: {
    name: 'approval_requests',
    columns: [
      {
        name: 'resource_type',
        type: 'select',
        options: ['template', 'campaign'],
        required: true,
      },
      { name: 'resource_id', type: 'text', required: true },
      { name: 'requested_by', type: 'text', required: true },
      {
        name: 'status',
        type: 'select',
        options: ['pending', 'approved', 'rejected'],
        required: true,
      },
      { name: 'reviewed_by', type: 'text' },
      { name: 'review_note', type: 'text' },
      { name: 'reviewed_at', type: 'text' },
    ],
  },
  audit_log: {
    name: 'audit_log',
    columns: [
      { name: 'workspace_id', type: 'text', required: true },
      { name: 'user_id', type: 'text', required: true },
      { name: 'action', type: 'text', required: true },
      { name: 'resource_type', type: 'text', required: true },
      { name: 'resource_id', type: 'text', required: true },
      { name: 'details_json', type: 'text' },
    ],
  },
  brand_kits: {
    name: 'brand_kits',
    columns: [
      { name: 'workspace_id', type: 'text', required: true },
      { name: 'name', type: 'text', required: true },
      { name: 'colors_json', type: 'text' },
      { name: 'fonts_json', type: 'text' },
      { name: 'logo_file_id', type: 'text' },
    ],
  },
};

export async function bootstrapTeamsTables(dataBrain: {
  listTables(workspaceId: string): Promise<Array<{ id: string; name: string }>>;
  createTable(input: { name: string; description?: string }): Promise<{ id: string }>;
  createColumn(input: {
    tableId: string;
    name: string;
    type: string;
    required?: boolean;
  }): Promise<unknown>;
}): Promise<{
  membersTableId: string;
  approvalsTableId: string;
  auditLogTableId: string;
  brandKitsTableId: string;
}> {
  const existing = await dataBrain.listTables('default');
  const existingByName = new Map(existing.map((t) => [t.name, t.id]));

  const results: Record<string, string> = {};

  for (const [key, schema] of Object.entries(TEAMS_TABLES)) {
    let tableId = existingByName.get(schema.name);
    if (!tableId) {
      const table = await dataBrain.createTable({
        name: schema.name,
        description: `Email teams: ${schema.name}`,
      });
      tableId = table.id;
      for (const col of schema.columns) {
        await dataBrain.createColumn({
          tableId,
          name: col.name,
          type: col.type,
          required: col.required,
        });
      }
    }
    results[key] = tableId;
  }

  return {
    membersTableId: results['workspace_members']!,
    approvalsTableId: results['approval_requests']!,
    auditLogTableId: results['audit_log']!,
    brandKitsTableId: results['brand_kits']!,
  };
}
