import postgres from 'postgres';

export type Sql = postgres.Sql;
/** A transaction handle; repositories accept either, so a route can compose them atomically. */
export type Db = postgres.Sql | postgres.TransactionSql;

export function createSql(databaseUrl: string, options: { max?: number } = {}): Sql {
  return postgres(databaseUrl, {
    max: options.max ?? 10,
    idle_timeout: 30,
    connect_timeout: 10,
    // The NOTICE chatter of CREATE ... IF NOT EXISTS is not an operational signal.
    onnotice: () => {},
    // timestamptz arrive as ISO strings, which is the wire format of the API.
    types: {
      date: {
        to: 1184,
        from: [1082, 1114, 1184],
        serialize: (x: Date | string) => (x instanceof Date ? x.toISOString() : x),
        parse: (x: string) => new Date(x).toISOString(),
      },
    },
  });
}
