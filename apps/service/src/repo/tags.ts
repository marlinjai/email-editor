import type { Db } from '../db.js';

/** A tag with the number of contacts carrying it, counted on read. */
export type TagRow = { id: string; slug: string; name: string; contact_count: number; created_at: string };

const SELECT = `SELECT g.id, g.slug, g.name, g.created_at,
  (SELECT count(*)::int FROM contact_tags ct WHERE ct.tag_id = g.id) AS contact_count FROM tags g`;

export function tagsRepo(db: Db) {
  return {
    /** Returns null when the slug is taken in this workspace. */
    async create(workspaceId: string, input: { slug: string; name: string }): Promise<TagRow | null> {
      const rows = await db<{ id: string }[]>`
        INSERT INTO tags (workspace_id, slug, name) VALUES (${workspaceId}, ${input.slug}, ${input.name})
        ON CONFLICT (workspace_id, slug) DO NOTHING RETURNING id`;
      return rows[0] ? this.get(workspaceId, rows[0].id) : null;
    },

    async get(workspaceId: string, tagId: string): Promise<TagRow | null> {
      const rows = await db<TagRow[]>`${db.unsafe(SELECT)} WHERE g.workspace_id = ${workspaceId} AND g.id = ${tagId}`;
      return rows[0] ?? null;
    },

    /** The tags among `slugs` that exist; a caller compares lengths to find unknown ones. */
    async bySlugs(workspaceId: string, slugs: readonly string[]): Promise<TagRow[]> {
      if (slugs.length === 0) return [];
      return db<TagRow[]>`${db.unsafe(SELECT)} WHERE g.workspace_id = ${workspaceId} AND g.slug = ANY(${slugs as string[]}) ORDER BY g.slug`;
    },

    async list(workspaceId: string, query: { afterId?: string; limit: number }): Promise<TagRow[]> {
      return db<TagRow[]>`
        ${db.unsafe(SELECT)} WHERE g.workspace_id = ${workspaceId}
        ${
          query.afterId
            ? db`AND (g.created_at, g.id) > (SELECT created_at, id FROM tags WHERE workspace_id = ${workspaceId} AND id = ${query.afterId})`
            : db``
        }
        ORDER BY g.created_at, g.id LIMIT ${query.limit}`;
    },

    /** Deletes the tag; the schema takes it off every contact. */
    async delete(workspaceId: string, tagId: string): Promise<boolean> {
      const rows = await db`DELETE FROM tags WHERE workspace_id = ${workspaceId} AND id = ${tagId} RETURNING id`;
      return rows.length > 0;
    },

    /**
     * Puts the tags on the contacts. Ids that name no contact of this workspace
     * are ignored (the composite key makes another workspace's contact
     * impossible). Returns how many (contact, tag) pairs were new.
     */
    async assign(workspaceId: string, tagIds: readonly string[], contactIds: readonly string[]): Promise<number> {
      if (tagIds.length === 0 || contactIds.length === 0) return 0;
      const rows = await db`
        INSERT INTO contact_tags (workspace_id, contact_id, tag_id)
        SELECT ${workspaceId}, c.id, t FROM contacts c, unnest(${tagIds as string[]}::uuid[]) AS t
        WHERE c.workspace_id = ${workspaceId} AND c.id = ANY(${contactIds as string[]}::uuid[])
        ON CONFLICT DO NOTHING
        RETURNING contact_id`;
      return rows.length;
    },

    /** Takes the tag off the contacts. Returns how many had it. */
    async unassign(workspaceId: string, tagId: string, contactIds: readonly string[]): Promise<number> {
      const rows = await db`
        DELETE FROM contact_tags
        WHERE workspace_id = ${workspaceId} AND tag_id = ${tagId} AND contact_id = ANY(${contactIds as string[]}::uuid[])
        RETURNING contact_id`;
      return rows.length;
    },

    /** The tag ids a contact carries. */
    async idsOfContact(workspaceId: string, contactId: string): Promise<string[]> {
      const rows = await db<{ tag_id: string }[]>`
        SELECT tag_id FROM contact_tags WHERE workspace_id = ${workspaceId} AND contact_id = ${contactId}`;
      return rows.map((r) => r.tag_id);
    },
  };
}
