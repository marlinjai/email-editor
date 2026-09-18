import type { Db } from '../db.js';
import type { ApiKeyScope, AuditActor } from '@marlinjai/mail-contract';

export type ApiKey = {
  id: string;
  name: string;
  prefix: string;
  scope: ApiKeyScope;
  last_used_at: string | null;
  revoked_at: string | null;
  created_at: string;
};

/** What the auth middleware needs to know about a presented key. */
export type ApiKeyCredential = {
  id: string;
  workspace_id: string;
  key_hash: string;
  scope: ApiKeyScope;
  revoked_at: string | null;
};

const COLUMNS = 'id, name, prefix, scope, last_used_at, revoked_at, created_at';

export function apiKeysRepo(db: Db) {
  return {
    async create(
      workspaceId: string,
      input: { name: string; prefix: string; keyHash: string; scope: ApiKeyScope; createdBy: AuditActor },
    ): Promise<ApiKey> {
      const rows = await db<ApiKey[]>`
        INSERT INTO api_keys (workspace_id, name, prefix, key_hash, scope, created_by)
        VALUES (${workspaceId}, ${input.name}, ${input.prefix}, ${input.keyHash}, ${input.scope}, ${db.json(input.createdBy)})
        RETURNING ${db.unsafe(COLUMNS)}`;
      return rows[0]!;
    },

    async list(workspaceId: string, page: { afterId?: string; limit: number }): Promise<ApiKey[]> {
      return db<ApiKey[]>`
        SELECT ${db.unsafe(COLUMNS)} FROM api_keys
        WHERE workspace_id = ${workspaceId}
        ${
          page.afterId
            ? db`AND (created_at, id) < (SELECT created_at, id FROM api_keys WHERE workspace_id = ${workspaceId} AND id = ${page.afterId})`
            : db``
        }
        ORDER BY created_at DESC, id DESC
        LIMIT ${page.limit}`;
    },

    async exists(workspaceId: string, keyId: string): Promise<boolean> {
      const rows = await db`SELECT 1 FROM api_keys WHERE workspace_id = ${workspaceId} AND id = ${keyId}`;
      return rows.length > 0;
    },

    async get(workspaceId: string, keyId: string): Promise<ApiKey | null> {
      const rows = await db<ApiKey[]>`
        SELECT ${db.unsafe(COLUMNS)} FROM api_keys WHERE workspace_id = ${workspaceId} AND id = ${keyId}`;
      return rows[0] ?? null;
    },

    /**
     * Revokes a key. Idempotent: revoking a revoked key returns it unchanged,
     * with `changed` false so no second audit row is written.
     */
    async revoke(workspaceId: string, keyId: string): Promise<{ key: ApiKey; changed: boolean } | null> {
      const updated = await db<ApiKey[]>`
        UPDATE api_keys SET revoked_at = now()
        WHERE workspace_id = ${workspaceId} AND id = ${keyId} AND revoked_at IS NULL
        RETURNING ${db.unsafe(COLUMNS)}`;
      if (updated[0]) return { key: updated[0], changed: true };
      const existing = await this.get(workspaceId, keyId);
      return existing ? { key: existing, changed: false } : null;
    },

    /**
     * The one lookup that is not scoped by a workspace, because it is how the
     * workspace is found: by the SHA-256 of the presented key. It returns the
     * workspace the key belongs to and nothing else.
     */
    async findCredentialByHash(keyHash: string): Promise<ApiKeyCredential | null> {
      const rows = await db<ApiKeyCredential[]>`
        SELECT id, workspace_id, key_hash, scope, revoked_at FROM api_keys WHERE key_hash = ${keyHash}`;
      return rows[0] ?? null;
    },

    /** Records use at most once a minute, so a busy client does not turn every request into a write. */
    async touch(workspaceId: string, keyId: string): Promise<void> {
      await db`
        UPDATE api_keys SET last_used_at = now()
        WHERE workspace_id = ${workspaceId} AND id = ${keyId}
          AND (last_used_at IS NULL OR last_used_at < now() - interval '1 minute')`;
    },
  };
}
