import type { DatabaseAdapter, Table, Column, ColumnType } from '@marlinjai/data-table-core';

export interface TableDefinition {
  name: string;
  columns: Array<{
    name: string;
    type: ColumnType;
    options?: string[];
    required?: boolean;
  }>;
}

export async function bootstrapTables(
  client: DatabaseAdapter,
  workspaceId: string,
  tables: TableDefinition[]
): Promise<Map<string, Table>> {
  const existing = await client.listTables(workspaceId);
  const tableMap = new Map<string, Table>(
    existing.map((t) => [t.name, t])
  );

  for (const def of tables) {
    let table = tableMap.get(def.name);

    if (!table) {
      table = await client.createTable({ workspaceId, name: def.name });
      tableMap.set(def.name, table);
    }

    const existingColumns = await client.getColumns(table.id);
    const columnsByName = new Map<string, Column>(
      existingColumns.map((c) => [c.name, c])
    );

    for (const colDef of def.columns) {
      let column = columnsByName.get(colDef.name);

      if (!column) {
        column = await client.createColumn({
          tableId: table.id,
          name: colDef.name,
          type: colDef.type,
        });
        columnsByName.set(colDef.name, column);
      }

      if (
        colDef.options?.length &&
        (colDef.type === 'select' || colDef.type === 'multi_select')
      ) {
        const existingOptions = await client.getSelectOptions(column.id);
        const existingNames = new Set(existingOptions.map((o) => o.name));

        for (const optionName of colDef.options) {
          if (!existingNames.has(optionName)) {
            await client.createSelectOption({
              columnId: column.id,
              name: optionName,
            });
          }
        }
      }
    }
  }

  return tableMap;
}
