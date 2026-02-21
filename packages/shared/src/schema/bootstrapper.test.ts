import { describe, it, expect, vi, beforeEach } from 'vitest';
import { bootstrapTables, type TableDefinition } from './bootstrapper';

function createMockClient() {
  return {
    listTables: vi.fn().mockResolvedValue([]),
    createTable: vi.fn().mockImplementation(async (input: { name: string }) => ({
      id: `table-${input.name}`,
      name: input.name,
      workspaceId: 'ws-1',
      createdAt: new Date(),
      updatedAt: new Date(),
    })),
    getColumns: vi.fn().mockResolvedValue([]),
    createColumn: vi.fn().mockImplementation(async (input: { tableId: string; name: string; type: string }) => ({
      id: `col-${input.name}`,
      tableId: input.tableId,
      name: input.name,
      type: input.type,
      position: 0,
      width: 200,
      isPrimary: false,
      createdAt: new Date(),
    })),
    getSelectOptions: vi.fn().mockResolvedValue([]),
    createSelectOption: vi.fn().mockResolvedValue({ id: 'opt-1', name: 'option' }),
  };
}

describe('bootstrapTables', () => {
  let mockClient: ReturnType<typeof createMockClient>;

  beforeEach(() => {
    mockClient = createMockClient();
  });

  it('creates a new table when it does not exist', async () => {
    const tables: TableDefinition[] = [
      { name: 'templates', columns: [] },
    ];

    const result = await bootstrapTables(mockClient as never, 'ws-1', tables);

    expect(mockClient.createTable).toHaveBeenCalledWith({
      workspaceId: 'ws-1',
      name: 'templates',
    });
    expect(result.get('templates')).toBeDefined();
  });

  it('skips table creation when table already exists', async () => {
    mockClient.listTables.mockResolvedValue([
      { id: 'existing-table', name: 'templates', workspaceId: 'ws-1' },
    ]);

    const tables: TableDefinition[] = [
      { name: 'templates', columns: [] },
    ];

    await bootstrapTables(mockClient as never, 'ws-1', tables);

    expect(mockClient.createTable).not.toHaveBeenCalled();
  });

  it('creates columns for a new table', async () => {
    const tables: TableDefinition[] = [
      {
        name: 'templates',
        columns: [
          { name: 'title', type: 'text' },
          { name: 'status', type: 'select', options: ['draft', 'active'] },
        ],
      },
    ];

    await bootstrapTables(mockClient as never, 'ws-1', tables);

    expect(mockClient.createColumn).toHaveBeenCalledTimes(2);
    expect(mockClient.createColumn).toHaveBeenCalledWith({
      tableId: 'table-templates',
      name: 'title',
      type: 'text',
    });
  });

  it('skips column creation when column already exists', async () => {
    mockClient.listTables.mockResolvedValue([
      { id: 'table-1', name: 'templates', workspaceId: 'ws-1' },
    ]);
    mockClient.getColumns.mockResolvedValue([
      { id: 'col-1', name: 'title', type: 'text', tableId: 'table-1' },
    ]);

    const tables: TableDefinition[] = [
      {
        name: 'templates',
        columns: [{ name: 'title', type: 'text' }],
      },
    ];

    await bootstrapTables(mockClient as never, 'ws-1', tables);

    expect(mockClient.createColumn).not.toHaveBeenCalled();
  });

  it('creates select options for select columns', async () => {
    const tables: TableDefinition[] = [
      {
        name: 'templates',
        columns: [
          { name: 'status', type: 'select', options: ['draft', 'active', 'archived'] },
        ],
      },
    ];

    await bootstrapTables(mockClient as never, 'ws-1', tables);

    expect(mockClient.createSelectOption).toHaveBeenCalledTimes(3);
    expect(mockClient.createSelectOption).toHaveBeenCalledWith({
      columnId: 'col-status',
      name: 'draft',
    });
  });

  it('skips select options that already exist', async () => {
    mockClient.getSelectOptions.mockResolvedValue([
      { id: 'opt-1', name: 'draft', columnId: 'col-status' },
    ]);

    const tables: TableDefinition[] = [
      {
        name: 'templates',
        columns: [
          { name: 'status', type: 'select', options: ['draft', 'active'] },
        ],
      },
    ];

    await bootstrapTables(mockClient as never, 'ws-1', tables);

    expect(mockClient.createSelectOption).toHaveBeenCalledTimes(1);
    expect(mockClient.createSelectOption).toHaveBeenCalledWith({
      columnId: 'col-status',
      name: 'active',
    });
  });
});
