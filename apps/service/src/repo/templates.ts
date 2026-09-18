import type { Db } from '../db.js';

export type TemplateRow = {
  id: string;
  name: string;
  description: string | null;
  document: Record<string, unknown>;
  version: number;
  thumbnail_url: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};
export type TemplateSummaryRow = Omit<TemplateRow, 'document'>;

export type TemplateVersionRow = {
  template_id: string;
  version: number;
  document: Record<string, unknown>;
  created_by: string | null;
  created_at: string;
};

const SUMMARY = 'id, name, description, version, thumbnail_url, archived_at, created_at, updated_at';
const FULL = `${SUMMARY}, document`;
const VERSION = 'template_id, version, document, created_by, created_at';

/** What a save changes. Absent fields keep their value; `description: null` clears it. */
export type TemplateChanges = {
  name?: string;
  description?: string | null;
  document?: Record<string, unknown>;
  schemaVersion?: string;
  archived?: boolean;
};

export type SaveOutcome =
  | { kind: 'saved'; template: TemplateRow }
  /** Nothing differed from the current state: no new version, the row as it is. */
  | { kind: 'unchanged'; template: TemplateRow }
  /** The template has moved on since `baseVersion`. */
  | { kind: 'conflict'; currentVersion: number }
  | { kind: 'not_found' };

type Json = Parameters<Db['json']>[0];

export function templatesRepo(db: Db) {
  async function appendVersion(
    workspaceId: string,
    template: { id: string; version: number; document: Record<string, unknown> },
    schemaVersion: string,
    createdBy: string,
  ): Promise<void> {
    await db`
      INSERT INTO template_versions (workspace_id, template_id, version, document, schema_version, created_by)
      VALUES (${workspaceId}, ${template.id}, ${template.version}, ${db.json(template.document as Json)},
              ${schemaVersion}, ${createdBy})`;
  }

  return {
    /** Creates a template at version 1 and records that version. Call inside a transaction. */
    async create(
      workspaceId: string,
      input: { name: string; description: string | null; document: Record<string, unknown>; schemaVersion: string; createdBy: string },
    ): Promise<TemplateRow> {
      const rows = await db<TemplateRow[]>`
        INSERT INTO templates (workspace_id, name, description, document, schema_version)
        VALUES (${workspaceId}, ${input.name}, ${input.description}, ${db.json(input.document as Json)}, ${input.schemaVersion})
        RETURNING ${db.unsafe(FULL)}`;
      const created = rows[0]!;
      await appendVersion(workspaceId, created, input.schemaVersion, input.createdBy);
      return created;
    },

    async get(workspaceId: string, templateId: string): Promise<TemplateRow | null> {
      const rows = await db<TemplateRow[]>`
        SELECT ${db.unsafe(FULL)} FROM templates WHERE workspace_id = ${workspaceId} AND id = ${templateId}`;
      return rows[0] ?? null;
    },

    async exists(workspaceId: string, templateId: string): Promise<boolean> {
      const rows = await db`SELECT 1 FROM templates WHERE workspace_id = ${workspaceId} AND id = ${templateId}`;
      return rows.length > 0;
    },

    /** Most recently changed first. `archived` filters; absent lists both. */
    async list(
      workspaceId: string,
      query: { afterId?: string; limit: number; archived?: boolean },
    ): Promise<TemplateSummaryRow[]> {
      return db<TemplateSummaryRow[]>`
        SELECT ${db.unsafe(SUMMARY)} FROM templates
        WHERE workspace_id = ${workspaceId}
        ${query.archived === undefined ? db`` : query.archived ? db`AND archived_at IS NOT NULL` : db`AND archived_at IS NULL`}
        ${
          query.afterId
            ? db`AND (updated_at, id) < (SELECT updated_at, id FROM templates WHERE workspace_id = ${workspaceId} AND id = ${query.afterId})`
            : db``
        }
        ORDER BY updated_at DESC, id DESC
        LIMIT ${query.limit}`;
    },

    /**
     * Saves a change on top of `baseVersion`. The row is locked first, so two
     * saves on the same base cannot both win: the second sees the first's
     * version and gets a conflict. A save that changes nothing keeps the
     * version (and writes no history). Every real change bumps the version by
     * one and appends that version's document to the history, in the same
     * transaction. Call inside a transaction.
     */
    async save(
      workspaceId: string,
      templateId: string,
      baseVersion: number,
      changes: TemplateChanges,
      createdBy: string,
    ): Promise<SaveOutcome> {
      const locked = await db<(TemplateRow & { schema_version: string; same_document: boolean })[]>`
        SELECT ${db.unsafe(FULL)}, schema_version,
               ${changes.document === undefined ? db`true` : db`document = ${db.json(changes.document as Json)}::jsonb`} AS same_document
        FROM templates WHERE workspace_id = ${workspaceId} AND id = ${templateId}
        FOR UPDATE`;
      const current = locked[0];
      if (!current) return { kind: 'not_found' };
      if (current.version !== baseVersion) return { kind: 'conflict', currentVersion: current.version };

      const { same_document, schema_version, ...currentRow } = current;
      const nameChanged = changes.name !== undefined && changes.name !== current.name;
      const descriptionChanged = changes.description !== undefined && changes.description !== current.description;
      const archivedChanged = changes.archived !== undefined && changes.archived !== (current.archived_at !== null);
      const documentChanged = !same_document;
      if (!nameChanged && !descriptionChanged && !archivedChanged && !documentChanged) {
        return { kind: 'unchanged', template: currentRow };
      }

      const nextSchema = documentChanged ? (changes.schemaVersion ?? schema_version) : schema_version;
      const rows = await db<TemplateRow[]>`
        UPDATE templates SET
          name = ${nameChanged ? changes.name! : current.name},
          description = ${descriptionChanged ? (changes.description ?? null) : current.description},
          document = ${documentChanged ? db`${db.json(changes.document as Json)}::jsonb` : db`document`},
          schema_version = ${nextSchema},
          archived_at = ${archivedChanged ? (changes.archived ? db`now()` : db`NULL`) : db`archived_at`},
          version = version + 1,
          updated_at = now()
        WHERE workspace_id = ${workspaceId} AND id = ${templateId}
        RETURNING ${db.unsafe(FULL)}`;
      const saved = rows[0]!;
      await appendVersion(workspaceId, saved, nextSchema, createdBy);
      return { kind: 'saved', template: saved };
    },

    /** Deletes a template and its history. Returns the deleted row's name, or null if none. */
    async delete(workspaceId: string, templateId: string): Promise<{ name: string; version: number } | null> {
      const rows = await db<{ name: string; version: number }[]>`
        DELETE FROM templates WHERE workspace_id = ${workspaceId} AND id = ${templateId} RETURNING name, version`;
      return rows[0] ?? null;
    },

    /** Newest version first. The cursor is a version number of the same template. */
    async versions(
      workspaceId: string,
      templateId: string,
      page: { beforeVersion?: number; limit: number },
    ): Promise<TemplateVersionRow[]> {
      return db<TemplateVersionRow[]>`
        SELECT ${db.unsafe(VERSION)} FROM template_versions
        WHERE workspace_id = ${workspaceId} AND template_id = ${templateId}
        ${page.beforeVersion === undefined ? db`` : db`AND version < ${page.beforeVersion}`}
        ORDER BY version DESC
        LIMIT ${page.limit}`;
    },

    async version(workspaceId: string, templateId: string, version: number): Promise<TemplateVersionRow | null> {
      const rows = await db<TemplateVersionRow[]>`
        SELECT ${db.unsafe(VERSION)} FROM template_versions
        WHERE workspace_id = ${workspaceId} AND template_id = ${templateId} AND version = ${version}`;
      return rows[0] ?? null;
    },
  };
}
