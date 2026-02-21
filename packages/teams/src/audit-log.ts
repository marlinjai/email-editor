import type { TeamsStorageAdapter } from './adapter';
import type { AuditLogEntry, AuditLogQueryOptions } from './types';

export class AuditLogger {
  constructor(private readonly adapter: TeamsStorageAdapter) {}

  async log(
    workspaceId: string,
    userId: string,
    action: string,
    resourceType: string,
    resourceId: string,
    details?: Record<string, unknown>
  ): Promise<AuditLogEntry> {
    return this.adapter.createAuditEntry({
      workspaceId,
      userId,
      action,
      resourceType,
      resourceId,
      details,
    });
  }

  async query(
    workspaceId: string,
    options?: AuditLogQueryOptions
  ): Promise<{ data: AuditLogEntry[]; total: number }> {
    return this.adapter.queryAuditLog(workspaceId, options);
  }
}
