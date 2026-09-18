import type { Db } from '../db.js';
import type { WorkspaceSettings } from '../schemas.js';

export type Workspace = {
  id: string;
  slug: string;
  name: string;
  settings: WorkspaceSettings;
  created_at: string;
  updated_at: string;
};

export function workspacesRepo(db: Db) {
  return {
    /** Creating is the one write with no workspace yet; it returns the new id. */
    async create(input: { slug: string; name: string; settings: WorkspaceSettings }): Promise<Workspace | null> {
      const rows = await db<Workspace[]>`
        INSERT INTO workspaces (slug, name, settings)
        VALUES (${input.slug}, ${input.name}, ${db.json(input.settings)})
        ON CONFLICT (slug) DO NOTHING
        RETURNING id, slug, name, settings, created_at, updated_at`;
      return rows[0] ?? null;
    },

    async get(workspaceId: string): Promise<Workspace | null> {
      const rows = await db<Workspace[]>`
        SELECT id, slug, name, settings, created_at, updated_at
        FROM workspaces WHERE id = ${workspaceId}`;
      return rows[0] ?? null;
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
      return rows[0] ?? null;
    },

    /**
     * The workspaces a person belongs to, with their role in each. Keyed by the
     * person rather than a workspace, because it answers "which tenants may this
     * subject enter"; it returns only rows the subject is a member of.
     */
    async listForSubject(subject: string): Promise<Array<Workspace & { role: string }>> {
      return db<Array<Workspace & { role: string }>>`
        SELECT w.id, w.slug, w.name, w.settings, w.created_at, w.updated_at, m.role
        FROM workspace_members m JOIN workspaces w ON w.id = m.workspace_id
        WHERE m.subject = ${subject}
        ORDER BY w.created_at, w.id`;
    },
  };
}
