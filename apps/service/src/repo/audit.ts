import type { Db } from '../db.js';
import type { AuditAction, AuditActor } from '@marlinjai/mail-contract';

export type AuditEntry = {
  id: string;
  action: AuditAction;
  actor: AuditActor;
  target_type: string;
  target_id: string | null;
  details: Record<string, unknown>;
  created_at: string;
};

const COLUMNS = 'id, action, actor, target_type, target_id, details, created_at';

export function auditRepo(db: Db) {
  return {
    async record(
      workspaceId: string,
      entry: {
        action: AuditAction;
        actor: AuditActor;
        targetType: string;
        targetId: string | null;
        details?: Record<string, unknown>;
      },
    ): Promise<void> {
      await db`
        INSERT INTO audit_log (workspace_id, action, actor, target_type, target_id, details)
        VALUES (${workspaceId}, ${entry.action}, ${db.json(entry.actor)}, ${entry.targetType},
                ${entry.targetId}, ${db.json((entry.details ?? {}) as Record<string, never>)})`;
    },

    async exists(workspaceId: string, entryId: string): Promise<boolean> {
      const rows = await db`SELECT 1 FROM audit_log WHERE workspace_id = ${workspaceId} AND id = ${entryId}`;
      return rows.length > 0;
    },

    async list(
      workspaceId: string,
      query: { afterId?: string; limit: number; action?: AuditAction; targetId?: string },
    ): Promise<AuditEntry[]> {
      return db<AuditEntry[]>`
        SELECT ${db.unsafe(COLUMNS)} FROM audit_log
        WHERE workspace_id = ${workspaceId}
        ${query.action ? db`AND action = ${query.action}` : db``}
        ${query.targetId ? db`AND target_id = ${query.targetId}` : db``}
        ${
          query.afterId
            ? db`AND (created_at, id) < (SELECT created_at, id FROM audit_log WHERE workspace_id = ${workspaceId} AND id = ${query.afterId})`
            : db``
        }
        ORDER BY created_at DESC, id DESC
        LIMIT ${query.limit}`;
    },
  };
}
