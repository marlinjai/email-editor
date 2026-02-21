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

export const TEMPLATE_TABLES: Record<string, TableSchemaDef> = {
  templates: {
    name: 'templates',
    columns: [
      { name: 'name', type: 'text', required: true },
      { name: 'description', type: 'text' },
      {
        name: 'category',
        type: 'select',
        options: ['Marketing', 'Newsletter', 'Transactional', 'Notification', 'Other'],
      },
      { name: 'tags', type: 'multi_select', options: [] },
      { name: 'status', type: 'select', options: ['draft', 'active', 'archived'], required: true },
      { name: 'template_json', type: 'text', required: true },
      { name: 'thumbnail_file_id', type: 'text' },
      { name: 'version', type: 'number', required: true },
    ],
  },
  template_versions: {
    name: 'template_versions',
    columns: [
      { name: 'template_id', type: 'text', required: true },
      { name: 'version_number', type: 'number', required: true },
      { name: 'template_json', type: 'text', required: true },
      { name: 'change_summary', type: 'text' },
    ],
  },
};

/**
 * Bootstrap the required tables in Data Brain.
 * Idempotent — checks if tables already exist before creating.
 */
export async function bootstrapTemplateTables(dataBrain: {
  listTables(workspaceId: string): Promise<Array<{ id: string; name: string }>>;
  createTable(input: { name: string; description?: string }): Promise<{ id: string }>;
  createColumn(input: {
    tableId: string;
    name: string;
    type: string;
    required?: boolean;
  }): Promise<unknown>;
}): Promise<{ templatesTableId: string; versionsTableId: string }> {
  const existing = await dataBrain.listTables('default');
  const existingByName = new Map(existing.map((t) => [t.name, t.id]));

  let templatesTableId = existingByName.get(TEMPLATE_TABLES.templates.name);
  let versionsTableId = existingByName.get(TEMPLATE_TABLES.template_versions.name);

  if (!templatesTableId) {
    const table = await dataBrain.createTable({
      name: TEMPLATE_TABLES.templates.name,
      description: 'Email templates',
    });
    templatesTableId = table.id;
    for (const col of TEMPLATE_TABLES.templates.columns) {
      await dataBrain.createColumn({
        tableId: templatesTableId,
        name: col.name,
        type: col.type,
        required: col.required,
      });
    }
  }

  if (!versionsTableId) {
    const table = await dataBrain.createTable({
      name: TEMPLATE_TABLES.template_versions.name,
      description: 'Email template version history',
    });
    versionsTableId = table.id;
    for (const col of TEMPLATE_TABLES.template_versions.columns) {
      await dataBrain.createColumn({
        tableId: versionsTableId,
        name: col.name,
        type: col.type,
        required: col.required,
      });
    }
  }

  return { templatesTableId, versionsTableId };
}
