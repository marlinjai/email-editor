import type { AbTestState, AuditActor, MailingCounts, MailingMetadata, MailingStatus, TrackingSettings } from '@marlinjai/mail-contract';
import type { Db } from '../db.js';
import { asJson } from './json.js';

/**
 * A mailing as stored. `topic` is the topic's slug. `counts` is not stored: it is
 * computed from the recipient rows on every read, so it cannot drift from them.
 */
export type MailingRow = {
  id: string;
  name: string | null;
  subject: string;
  preheader: string | null;
  template_id: string | null;
  document: Record<string, unknown>;
  topic_id: string;
  topic: string;
  provider_id: string;
  status: MailingStatus;
  metadata: MailingMetadata;
  created_by: AuditActor;
  scheduled_at: string | null;
  /** S4: the A/B test as stored (the contract's AbTestState), null without one. */
  ab_test: AbTestState | null;
  /** S4: what is tracked for this mailing, fixed when it starts; null before. */
  tracking: TrackingSettings | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
  updated_at: string;
};

/** The compiled output, read by the worker; kept out of MailingRow because it is large. */
export type MailingCompiled = { mjml: string | null; html: string | null };

const COLUMNS_M = `m.id, m.name, m.subject, m.preheader, m.template_id, m.document, m.topic_id, t.slug AS topic,
  m.provider_id, m.status, m.metadata, m.created_by, m.scheduled_at, m.ab_test, m.tracking, m.started_at, m.finished_at, m.created_at, m.updated_at`;

const EMPTY_COUNTS: MailingCounts = { total: 0, queued: 0, sending: 0, sent: 0, failed: 0, skipped: 0 };

export function mailingsRepo(db: Db) {
  const selectOne = async (workspaceId: string, mailingId: string, lock: boolean) => {
    const rows = await db<MailingRow[]>`
      SELECT ${db.unsafe(COLUMNS_M)} FROM mailings m JOIN topics t ON t.id = m.topic_id
      WHERE m.workspace_id = ${workspaceId} AND m.id = ${mailingId}
      ${lock ? db`FOR UPDATE OF m` : db``}`;
    return rows[0] ?? null;
  };

  return {
    async create(
      workspaceId: string,
      input: {
        name: string | null;
        subject: string;
        preheader: string | null;
        templateId: string | null;
        document: Record<string, unknown>;
        topicId: string;
        providerId: string;
        metadata: MailingMetadata;
        createdBy: AuditActor;
      },
    ): Promise<MailingRow> {
      const rows = await db<{ id: string }[]>`
        INSERT INTO mailings (workspace_id, name, subject, preheader, template_id, document, topic_id, provider_id, metadata, created_by)
        VALUES (${workspaceId}, ${input.name}, ${input.subject}, ${input.preheader}, ${input.templateId},
                ${asJson(db, input.document)}, ${input.topicId}, ${input.providerId}, ${asJson(db, input.metadata)},
                ${asJson(db, input.createdBy)})
        RETURNING id`;
      return (await selectOne(workspaceId, rows[0]!.id, false))!;
    },

    /**
     * How many of the workspace's mailings still need this provider to send:
     * scheduled, sending or paused. Deleting a provider is refused while any do.
     */
    async countActiveForProvider(workspaceId: string, providerId: string): Promise<number> {
      const rows = await db<{ n: number }[]>`
        SELECT count(*)::int AS n FROM mailings
        WHERE workspace_id = ${workspaceId} AND provider_id = ${providerId}
          AND status IN ('scheduled', 'sending', 'paused')`;
      return rows[0]!.n;
    },

    async get(workspaceId: string, mailingId: string): Promise<MailingRow | null> {
      return selectOne(workspaceId, mailingId, false);
    },

    /** Reads and locks the mailing for the rest of the transaction, for a state change. */
    async lock(workspaceId: string, mailingId: string): Promise<MailingRow | null> {
      return selectOne(workspaceId, mailingId, true);
    },

    async compiled(workspaceId: string, mailingId: string): Promise<MailingCompiled | null> {
      const rows = await db<MailingCompiled[]>`
        SELECT mjml, html FROM mailings WHERE workspace_id = ${workspaceId} AND id = ${mailingId}`;
      return rows[0] ?? null;
    },

    async list(
      workspaceId: string,
      query: { afterId?: string; limit: number; status?: MailingStatus; topicId?: string },
    ): Promise<MailingRow[]> {
      return db<MailingRow[]>`
        SELECT ${db.unsafe(COLUMNS_M)} FROM mailings m JOIN topics t ON t.id = m.topic_id
        WHERE m.workspace_id = ${workspaceId}
        ${query.status ? db`AND m.status = ${query.status}` : db``}
        ${query.topicId ? db`AND m.topic_id = ${query.topicId}` : db``}
        ${
          query.afterId
            ? db`AND (m.created_at, m.id) < (SELECT created_at, id FROM mailings WHERE workspace_id = ${workspaceId} AND id = ${query.afterId})`
            : db``
        }
        ORDER BY m.created_at DESC, m.id DESC
        LIMIT ${query.limit}`;
    },

    /**
     * Changes content fields. The caller has checked the mailing is still
     * editable (EDITABLE_MAILING_STATUSES) under `lock`; this function applies.
     */
    async updateContent(
      workspaceId: string,
      mailingId: string,
      patch: {
        name?: string | null;
        subject?: string;
        preheader?: string | null;
        document?: Record<string, unknown>;
        topicId?: string;
        providerId?: string;
        metadata?: MailingMetadata;
      },
    ): Promise<MailingRow | null> {
      const rows = await db<{ id: string }[]>`
        UPDATE mailings SET
          name = ${patch.name === undefined ? db`name` : db`${patch.name}`},
          subject = COALESCE(${patch.subject ?? null}, subject),
          preheader = ${patch.preheader === undefined ? db`preheader` : db`${patch.preheader}`},
          document = COALESCE(${patch.document ? asJson(db, patch.document) : null}::jsonb, document),
          topic_id = COALESCE(${patch.topicId ?? null}::uuid, topic_id),
          provider_id = COALESCE(${patch.providerId ?? null}::uuid, provider_id),
          metadata = COALESCE(${patch.metadata ? asJson(db, patch.metadata) : null}::jsonb, metadata),
          -- the compiled output belongs to the old content
          mjml = CASE WHEN ${patch.document !== undefined} THEN NULL ELSE mjml END,
          html = CASE WHEN ${patch.document !== undefined} THEN NULL ELSE html END,
          updated_at = now()
        WHERE workspace_id = ${workspaceId} AND id = ${mailingId}
        RETURNING id`;
      return rows[0] ? selectOne(workspaceId, mailingId, false) : null;
    },

    async setCompiled(workspaceId: string, mailingId: string, compiled: { mjml: string; html: string }): Promise<void> {
      await db`
        UPDATE mailings SET mjml = ${compiled.mjml}, html = ${compiled.html}, updated_at = now()
        WHERE workspace_id = ${workspaceId} AND id = ${mailingId}`;
    },

    /**
     * Moves the mailing to `to` only if it is currently in one of `from`
     * (compare-and-set), stamping the timestamps given. Returns the updated row,
     * or null when the mailing was not in an allowed state: the caller answers
     * `mailing_invalid_state` from the contract's MAILING_TRANSITIONS.
     */
    async transition(
      workspaceId: string,
      mailingId: string,
      from: readonly MailingStatus[],
      to: MailingStatus,
      stamp: { startedAt?: boolean; finishedAt?: boolean; clearFinishedAt?: boolean } = {},
    ): Promise<MailingRow | null> {
      const rows = await db<{ id: string }[]>`
        UPDATE mailings SET
          status = ${to},
          started_at = ${stamp.startedAt ? db`COALESCE(started_at, now())` : db`started_at`},
          finished_at = ${stamp.finishedAt ? db`now()` : stamp.clearFinishedAt ? db`NULL` : db`finished_at`},
          updated_at = now()
        WHERE workspace_id = ${workspaceId} AND id = ${mailingId} AND status = ANY(${from as MailingStatus[]})
        RETURNING id`;
      return rows[0] ? selectOne(workspaceId, mailingId, false) : null;
    },

    /** Live counts per recipient status. */
    async counts(workspaceId: string, mailingId: string): Promise<MailingCounts> {
      return (await this.countsFor(workspaceId, [mailingId])).get(mailingId) ?? { ...EMPTY_COUNTS };
    },

    /** Counts for a page of mailings in one query. */
    async countsFor(workspaceId: string, mailingIds: readonly string[]): Promise<Map<string, MailingCounts>> {
      const out = new Map<string, MailingCounts>(mailingIds.map((id) => [id, { ...EMPTY_COUNTS }]));
      if (mailingIds.length === 0) return out;
      const rows = await db<{ mailing_id: string; status: keyof MailingCounts; n: number }[]>`
        SELECT mailing_id, status, count(*)::int AS n FROM mailing_recipients
        WHERE workspace_id = ${workspaceId} AND mailing_id = ANY(${mailingIds as string[]}::uuid[])
        GROUP BY mailing_id, status`;
      for (const r of rows) {
        const c = out.get(r.mailing_id)!;
        c[r.status] = r.n;
        c.total += r.n;
      }
      return out;
    },

    /**
     * Mailings the worker should work on: every `sending` mailing, oldest
     * activity first. Deliberately not scoped by a workspace (the worker serves
     * all of them); it returns only ids, and everything the worker does next goes
     * through the workspace-scoped functions with the workspace it got here.
     */
    async listSendingForWorker(limit: number): Promise<Array<{ workspace_id: string; id: string }>> {
      return db<Array<{ workspace_id: string; id: string }>>`
        SELECT workspace_id, id FROM mailings WHERE status = 'sending' ORDER BY updated_at, id LIMIT ${limit}`;
    },
  };
}
