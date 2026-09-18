import type { Db } from '../db.js';
import { asJson } from './json.js';

export type TopicTranslations = Record<string, { name: string; description: string | null }>;

export type TopicRow = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  translations: TopicTranslations;
  created_at: string;
  updated_at: string;
};

const COLUMNS = 'id, slug, name, description, translations, created_at, updated_at';

export function topicsRepo(db: Db) {
  return {
    /** Returns null when the slug is taken in this workspace. */
    async create(
      workspaceId: string,
      input: { slug: string; name: string; description: string | null; translations: TopicTranslations },
    ): Promise<TopicRow | null> {
      const rows = await db<TopicRow[]>`
        INSERT INTO topics (workspace_id, slug, name, description, translations)
        VALUES (${workspaceId}, ${input.slug}, ${input.name}, ${input.description}, ${asJson(db, input.translations)})
        ON CONFLICT (workspace_id, slug) DO NOTHING
        RETURNING ${db.unsafe(COLUMNS)}`;
      return rows[0] ?? null;
    },

    async get(workspaceId: string, topicId: string): Promise<TopicRow | null> {
      const rows = await db<TopicRow[]>`
        SELECT ${db.unsafe(COLUMNS)} FROM topics WHERE workspace_id = ${workspaceId} AND id = ${topicId}`;
      return rows[0] ?? null;
    },

    async bySlug(workspaceId: string, slug: string): Promise<TopicRow | null> {
      const rows = await db<TopicRow[]>`
        SELECT ${db.unsafe(COLUMNS)} FROM topics WHERE workspace_id = ${workspaceId} AND slug = ${slug}`;
      return rows[0] ?? null;
    },

    /** The topics among `slugs` that exist; a caller compares lengths to find unknown ones. */
    async bySlugs(workspaceId: string, slugs: readonly string[]): Promise<TopicRow[]> {
      if (slugs.length === 0) return [];
      return db<TopicRow[]>`
        SELECT ${db.unsafe(COLUMNS)} FROM topics
        WHERE workspace_id = ${workspaceId} AND slug = ANY(${slugs as string[]})
        ORDER BY slug`;
    },

    async list(workspaceId: string, page: { afterId?: string; limit: number }): Promise<TopicRow[]> {
      return db<TopicRow[]>`
        SELECT ${db.unsafe(COLUMNS)} FROM topics
        WHERE workspace_id = ${workspaceId}
        ${
          page.afterId
            ? db`AND (created_at, id) > (SELECT created_at, id FROM topics WHERE workspace_id = ${workspaceId} AND id = ${page.afterId})`
            : db``
        }
        ORDER BY created_at, id
        LIMIT ${page.limit}`;
    },

    async update(
      workspaceId: string,
      topicId: string,
      patch: { name?: string; description?: string | null; translations?: TopicTranslations },
    ): Promise<TopicRow | null> {
      const rows = await db<TopicRow[]>`
        UPDATE topics SET
          name = COALESCE(${patch.name ?? null}, name),
          description = ${patch.description === undefined ? db`description` : db`${patch.description}`},
          translations = COALESCE(${patch.translations ? asJson(db, patch.translations) : null}::jsonb, translations),
          updated_at = now()
        WHERE workspace_id = ${workspaceId} AND id = ${topicId}
        RETURNING ${db.unsafe(COLUMNS)}`;
      return rows[0] ?? null;
    },
  };
}
