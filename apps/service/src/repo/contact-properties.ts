import type { ContactPropertyDefinition, ContactPropertyType } from '@marlinjai/mail-contract';
import type { Db } from '../db.js';

export type ContactPropertyRow = ContactPropertyDefinition & { created_at: string };

export function contactPropertiesRepo(db: Db) {
  return {
    /**
     * Serialises property writes against new definitions, per workspace, for
     * the rest of the transaction: a write that checks values takes it `shared`,
     * defining a key takes it `exclusive`.
     */
    async lockDefinitions(workspaceId: string, mode: 'shared' | 'exclusive'): Promise<void> {
      const key = `contact_properties:${workspaceId}`;
      if (mode === 'shared') await db`SELECT pg_advisory_xact_lock_shared(hashtext(${key}))`;
      else await db`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
    },

    async list(workspaceId: string): Promise<ContactPropertyRow[]> {
      return db<ContactPropertyRow[]>`
        SELECT key, label, type, created_at FROM contact_properties WHERE workspace_id = ${workspaceId} ORDER BY key`;
    },

    /** The workspace's definitions as a key to type map, for validating writes. */
    async types(workspaceId: string): Promise<Map<string, ContactPropertyType>> {
      const rows = await db<{ key: string; type: ContactPropertyType }[]>`
        SELECT key, type FROM contact_properties WHERE workspace_id = ${workspaceId}`;
      return new Map(rows.map((r) => [r.key, r.type]));
    },

    async get(workspaceId: string, key: string): Promise<ContactPropertyRow | null> {
      const rows = await db<ContactPropertyRow[]>`
        SELECT key, label, type, created_at FROM contact_properties WHERE workspace_id = ${workspaceId} AND key = ${key}`;
      return rows[0] ?? null;
    },

    /** Returns null when the key is already defined in this workspace. */
    async create(workspaceId: string, def: ContactPropertyDefinition): Promise<ContactPropertyRow | null> {
      const rows = await db<ContactPropertyRow[]>`
        INSERT INTO contact_properties (workspace_id, key, label, type)
        VALUES (${workspaceId}, ${def.key}, ${def.label}, ${def.type})
        ON CONFLICT (workspace_id, key) DO NOTHING
        RETURNING key, label, type, created_at`;
      return rows[0] ?? null;
    },

    async delete(workspaceId: string, key: string): Promise<boolean> {
      const rows = await db`DELETE FROM contact_properties WHERE workspace_id = ${workspaceId} AND key = ${key} RETURNING key`;
      return rows.length > 0;
    },

    /**
     * Up to `limit` contacts whose stored value of `key` is not null and not of
     * `type`, for refusing a definition that existing data already breaks.
     */
    async violations(workspaceId: string, key: string, type: ContactPropertyType, limit: number) {
      const jsonType = type === 'date' ? 'string' : type;
      return db<{ id: string; email: string; value: unknown }[]>`
        SELECT id, email, properties -> ${key} AS value FROM contacts
        WHERE workspace_id = ${workspaceId} AND properties ? ${key} AND jsonb_typeof(properties -> ${key}) <> 'null'
          AND (jsonb_typeof(properties -> ${key}) <> ${jsonType}
               OR (${type === 'date'} AND NOT (properties ->> ${key}) ~ '^\\d{4}-\\d{2}-\\d{2}([T ][0-9:.]+(Z|[+-]\\d{2}:?\\d{2})?)?$'))
        ORDER BY created_at, id LIMIT ${limit}`;
    },
  };
}
