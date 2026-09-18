import type { SegmentFilter } from '@marlinjai/mail-contract';
import type { Db } from '../db.js';
import type { Fragment } from '../segments/compile.js';
import { asJson } from './json.js';

export type SegmentRow = { id: string; name: string; filter: SegmentFilter; created_at: string; updated_at: string };

const COLUMNS = 'id, name, filter, created_at, updated_at';

export function segmentsRepo(db: Db) {
  return {
    async create(workspaceId: string, input: { name: string; filter: SegmentFilter }): Promise<SegmentRow> {
      const rows = await db<SegmentRow[]>`
        INSERT INTO segments (workspace_id, name, filter) VALUES (${workspaceId}, ${input.name}, ${asJson(db, input.filter)})
        RETURNING ${db.unsafe(COLUMNS)}`;
      return rows[0]!;
    },

    async get(workspaceId: string, segmentId: string): Promise<SegmentRow | null> {
      const rows = await db<SegmentRow[]>`
        SELECT ${db.unsafe(COLUMNS)} FROM segments WHERE workspace_id = ${workspaceId} AND id = ${segmentId}`;
      return rows[0] ?? null;
    },

    async list(workspaceId: string, query: { afterId?: string; limit: number }): Promise<SegmentRow[]> {
      return db<SegmentRow[]>`
        SELECT ${db.unsafe(COLUMNS)} FROM segments WHERE workspace_id = ${workspaceId}
        ${
          query.afterId
            ? db`AND (created_at, id) > (SELECT created_at, id FROM segments WHERE workspace_id = ${workspaceId} AND id = ${query.afterId})`
            : db``
        }
        ORDER BY created_at, id LIMIT ${query.limit}`;
    },

    async update(workspaceId: string, segmentId: string, input: { name: string; filter: SegmentFilter }): Promise<SegmentRow | null> {
      const rows = await db<SegmentRow[]>`
        UPDATE segments SET name = ${input.name}, filter = ${asJson(db, input.filter)}, updated_at = now()
        WHERE workspace_id = ${workspaceId} AND id = ${segmentId}
        RETURNING ${db.unsafe(COLUMNS)}`;
      return rows[0] ?? null;
    },

    async delete(workspaceId: string, segmentId: string): Promise<boolean> {
      const rows = await db`DELETE FROM segments WHERE workspace_id = ${workspaceId} AND id = ${segmentId} RETURNING id`;
      return rows.length > 0;
    },

    /** How many of the workspace's contacts `where` (a compiled filter over `contacts c`) matches. */
    async countMatching(workspaceId: string, where: Fragment): Promise<number> {
      const rows = await db<{ n: number }[]>`
        SELECT count(*)::int AS n FROM contacts c WHERE c.workspace_id = ${workspaceId} AND ${where}`;
      return rows[0]!.n;
    },

    /** The first `limit` matching contacts, oldest first. */
    async sampleMatching(workspaceId: string, where: Fragment, limit: number): Promise<Array<{ id: string; email: string }>> {
      return db<Array<{ id: string; email: string }>>`
        SELECT c.id, c.email FROM contacts c WHERE c.workspace_id = ${workspaceId} AND ${where}
        ORDER BY c.created_at, c.id LIMIT ${limit}`;
    },

    /**
     * Queues every matching contact subscribed to the topic as a recipient of
     * the mailing, in one statement. Idempotent on the address within the
     * mailing. Returns how many matched and how many were newly queued.
     */
    async queueMatching(
      workspaceId: string,
      mailingId: string,
      topicId: string,
      where: Fragment,
    ): Promise<{ matched: number; added: number }> {
      const rows = await db<{ matched: number; added: number }[]>`
        WITH matched AS (
          SELECT c.id, c.email FROM contacts c
          WHERE c.workspace_id = ${workspaceId} AND ${where}
            AND EXISTS (SELECT 1 FROM contact_topic_subscriptions s
                        WHERE s.workspace_id = ${workspaceId} AND s.contact_id = c.id AND s.topic_id = ${topicId})
        ), added AS (
          INSERT INTO mailing_recipients (workspace_id, mailing_id, email, contact_id)
          SELECT ${workspaceId}, ${mailingId}, m.email, m.id FROM matched m
          ON CONFLICT (mailing_id, email) DO NOTHING
          RETURNING 1
        )
        SELECT (SELECT count(*)::int FROM matched) AS matched, (SELECT count(*)::int FROM added) AS added`;
      return rows[0]!;
    },
  };
}
