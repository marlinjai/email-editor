import type postgres from 'postgres';
import type { Db } from '../db.js';

/** Binds a value as jsonb. The repositories accept plain records; postgres wants its own JSON type. */
export function asJson(db: Db, value: unknown): postgres.Parameter {
  return db.json(value as postgres.JSONValue);
}
