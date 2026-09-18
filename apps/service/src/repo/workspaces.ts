import type { Db } from '../db.js';
import type { WorkspaceSettings } from '@marlinjai/mail-contract';
import { withSettingDefaults } from '../workspace-settings.js';

export type Workspace = {
  id: string;
  slug: string;
  name: string;
  settings: WorkspaceSettings;
  created_at: string;
  updated_at: string;
};

/** A row as read, its settings completed with the defaults of fields added later. */
function complete<T extends Workspace>(row: T): T;
function complete<T extends Workspace>(row: T | undefined): T | null;
function complete<T extends Workspace>(row: T | undefined): T | null {
  return row ? { ...row, settings: withSettingDefaults(row.settings) } : null;
}

export function workspacesRepo(db: Db) {
  return {
    /** Creating is the one write with no workspace yet; it returns the new id. */
    async create(input: { slug: string; name: string; settings: WorkspaceSettings }): Promise<Workspace | null> {
      const rows = await db<Workspace[]>`
        INSERT INTO workspaces (slug, name, settings)
        VALUES (${input.slug}, ${input.name}, ${db.json(input.settings)})
        ON CONFLICT (slug) DO NOTHING
        RETURNING id, slug, name, settings, created_at, updated_at`;
      return complete(rows[0]);
    },

    async get(workspaceId: string): Promise<Workspace | null> {
      const rows = await db<Workspace[]>`
        SELECT id, slug, name, settings, created_at, updated_at
        FROM workspaces WHERE id = ${workspaceId}`;
      return complete(rows[0]);
    },

    async update(
      workspaceId: string,
      patch: { name?: string; settings?: WorkspaceSettings },
    ): Promise<Workspace | null> {
      const rows = await db<Workspace[]>`
        UPDATE workspaces SET
          name = COALESCE(${patch.name ?? null}, name),
          settings = COALESCE(${patch.settings ? db.json(patch.settings) : null}::jsonb, settings),
          updated_at = now()
        WHERE id = ${workspaceId}
        RETURNING id, slug, name, settings, created_at, updated_at`;
      return complete(rows[0]);
    },

    /**
     * The workspaces a person belongs to, with their role in each, a page at a
     * time. Keyed by the person rather than a workspace, because it answers
     * "which tenants may this subject enter"; it returns only rows the subject is
     * a member of.
     */
    async listForSubject(
      subject: string,
      page: { afterId?: string; limit: number },
    ): Promise<Array<Workspace & { role: string }>> {
      const rows = await db<Array<Workspace & { role: string }>>`
        SELECT w.id, w.slug, w.name, w.settings, w.created_at, w.updated_at, m.role
        FROM workspace_members m JOIN workspaces w ON w.id = m.workspace_id
        WHERE m.subject = ${subject}
        ${
          page.afterId
            ? db`AND (w.created_at, w.id) > (
                SELECT w2.created_at, w2.id FROM workspace_members m2 JOIN workspaces w2 ON w2.id = m2.workspace_id
                WHERE m2.subject = ${subject} AND w2.id = ${page.afterId})`
            : db``
        }
        ORDER BY w.created_at, w.id
        LIMIT ${page.limit}`;
      return rows.map((row) => complete(row));
    },

    /** Whether the subject is a member of the workspace; validates a cursor of listForSubject. */
    async subjectBelongsTo(subject: string, workspaceId: string): Promise<boolean> {
      const rows = await db`SELECT 1 FROM workspace_members WHERE workspace_id = ${workspaceId} AND subject = ${subject}`;
      return rows.length > 0;
    },
  };
}
