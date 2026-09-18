import type { AuditActor, ImportReport, ImportRowOutcome, ImportSkipReason, ImportStatus } from '@marlinjai/mail-contract';
import type { Db } from '../db.js';
import type { Blocks, ExistingContact } from '../imports/evaluate.js';
import { asJson } from './json.js';

export type ImportJobRow = {
  id: string;
  workspace_id: string;
  status: ImportStatus;
  file_name: string | null;
  file_bytes: number;
  total_rows: number;
  columns: string[];
  sample: string[][];
  suggested_mapping: Record<string, string>;
  mapping: Record<string, string> | null;
  mapping_version: number;
  topics: string[];
  tags: string[];
  update_existing: boolean;
  consent_stated_by: AuditActor | null;
  consent_stated_at: string | null;
  dry_run: ImportReport | null;
  result: ImportReport | null;
  processed_rows: number;
  failures: number;
  last_failure: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
  finished_at: string | null;
};

export type ImportRowRecord = {
  row_number: number;
  cells: string[];
  email: string | null;
  external_id: string | null;
};

export type ImportRowView = {
  row: number;
  email: string | null;
  outcome: ImportRowOutcome;
  reason: ImportSkipReason | null;
  message: string | null;
  contact_id: string | null;
};

export type RowResult = {
  row_number: number;
  outcome: ImportRowOutcome;
  reason: ImportSkipReason | null;
  message: string | null;
  withheld: boolean;
  contact_id: string | null;
};

const COLUMNS = `id, workspace_id, status, file_name, file_bytes, total_rows, columns, sample, suggested_mapping, mapping,
  mapping_version, topics, tags, update_existing, consent_stated_by, consent_stated_at, dry_run, result, processed_rows,
  failures, last_failure, error, created_at, updated_at, finished_at`;

const INSERT_BATCH = 1000;

function emptyReport(): ImportReport {
  return { created: 0, updated: 0, unchanged: 0, suppressed: 0, skipped: 0, skipped_by_reason: {}, topics_withheld: 0 };
}

/** Folds `(outcome, reason, n, withheld)` groups into the contract's report. */
function toReport(groups: { outcome: ImportRowOutcome; reason: ImportSkipReason | null; n: number; w: number }[]): ImportReport {
  const report = emptyReport();
  for (const g of groups) {
    report[g.outcome] += g.n;
    report.topics_withheld += g.w;
    if (g.outcome === 'skipped' && g.reason) report.skipped_by_reason[g.reason] = (report.skipped_by_reason[g.reason] ?? 0) + g.n;
  }
  return report;
}

export function importsRepo(db: Db) {
  const selectOne = async (workspaceId: string, importId: string, lock: boolean) => {
    const rows = await db<ImportJobRow[]>`
      SELECT ${db.unsafe(COLUMNS)} FROM import_jobs WHERE workspace_id = ${workspaceId} AND id = ${importId}
      ${lock ? db`FOR UPDATE` : db``}`;
    return rows[0] ?? null;
  };

  return {
    /** Creates the job and stores every row, in the caller's transaction. */
    async create(
      workspaceId: string,
      input: {
        fileName: string | null;
        fileBytes: number;
        columns: string[];
        sample: string[][];
        suggestedMapping: Record<string, string>;
        rows: { rowNumber: number; cells: string[] }[];
        createdBy: AuditActor;
      },
    ): Promise<ImportJobRow> {
      const [job] = await db<{ id: string }[]>`
        INSERT INTO import_jobs (workspace_id, file_name, file_bytes, total_rows, columns, sample, suggested_mapping, created_by)
        VALUES (${workspaceId}, ${input.fileName}, ${input.fileBytes}, ${input.rows.length}, ${asJson(db, input.columns)},
                ${asJson(db, input.sample)}, ${asJson(db, input.suggestedMapping)}, ${asJson(db, input.createdBy)})
        RETURNING id`;
      for (let i = 0; i < input.rows.length; i += INSERT_BATCH) {
        const chunk = input.rows.slice(i, i + INSERT_BATCH).map((r) => ({ row_number: r.rowNumber, cells: r.cells }));
        await db`
          INSERT INTO import_rows (workspace_id, import_id, row_number, cells)
          SELECT ${workspaceId}, ${job!.id}, x.row_number, x.cells
          FROM jsonb_to_recordset(${asJson(db, chunk)}::jsonb) AS x(row_number integer, cells jsonb)`;
      }
      return (await selectOne(workspaceId, job!.id, false))!;
    },

    async get(workspaceId: string, importId: string): Promise<ImportJobRow | null> {
      return selectOne(workspaceId, importId, false);
    },

    /** Reads and locks the job for the rest of the transaction; waits for a batch in flight. */
    async lock(workspaceId: string, importId: string): Promise<ImportJobRow | null> {
      return selectOne(workspaceId, importId, true);
    },

    async list(workspaceId: string, query: { afterId?: string; limit: number }): Promise<ImportJobRow[]> {
      return db<ImportJobRow[]>`
        SELECT ${db.unsafe(COLUMNS)} FROM import_jobs WHERE workspace_id = ${workspaceId}
        ${
          query.afterId
            ? db`AND (created_at, id) < (SELECT created_at, id FROM import_jobs WHERE workspace_id = ${workspaceId} AND id = ${query.afterId})`
            : db``
        }
        ORDER BY created_at DESC, id DESC LIMIT ${query.limit}`;
    },

    /**
     * Sets a new mapping: bumps the version, forgets the dry run, fills each
     * row's normalised address and external id from the mapped cells, and
     * moves the job to `validating`.
     */
    async setMapping(
      workspaceId: string,
      importId: string,
      input: {
        mapping: Record<string, string>;
        emailIndex: number;
        externalIdIndex: number | null;
        topics: string[];
        tags: string[];
        updateExisting: boolean;
        consentStatedBy: AuditActor;
      },
    ): Promise<ImportJobRow> {
      await db`
        UPDATE import_jobs SET
          status = 'validating', mapping = ${asJson(db, input.mapping)}, mapping_version = mapping_version + 1,
          topics = ${input.topics}, tags = ${input.tags}, update_existing = ${input.updateExisting},
          consent_stated_by = ${asJson(db, input.consentStatedBy)}, consent_stated_at = now(),
          dry_run = NULL, processed_rows = 0, failures = 0, last_failure = NULL, next_attempt_at = now(), updated_at = now()
        WHERE workspace_id = ${workspaceId} AND id = ${importId}`;
      await db`
        UPDATE import_rows SET
          email = NULLIF(lower(btrim(cells ->> ${input.emailIndex}::int)), ''),
          external_id = ${input.externalIdIndex === null ? null : db`NULLIF(btrim(cells ->> ${input.externalIdIndex}::int), '')`}
        WHERE workspace_id = ${workspaceId} AND import_id = ${importId}`;
      return (await selectOne(workspaceId, importId, false))!;
    },

    async startCommit(workspaceId: string, importId: string): Promise<ImportJobRow> {
      await db`
        UPDATE import_jobs SET status = 'committing', result = ${asJson(db, emptyReport())}, processed_rows = 0,
          failures = 0, last_failure = NULL, next_attempt_at = now(), updated_at = now()
        WHERE workspace_id = ${workspaceId} AND id = ${importId}`;
      return (await selectOne(workspaceId, importId, false))!;
    },

    /** Ends the job: `completed`, `cancelled` or `failed` (with `error`). */
    async finish(workspaceId: string, importId: string, status: 'completed' | 'cancelled' | 'failed', error: string | null = null) {
      await db`
        UPDATE import_jobs SET status = ${status}, error = ${error}, finished_at = now(), updated_at = now()
        WHERE workspace_id = ${workspaceId} AND id = ${importId}`;
      return (await selectOne(workspaceId, importId, false))!;
    },

    /**
     * The next import with work, across workspaces, locked for this
     * transaction and skipped by every other worker until it commits. Returns
     * only what locates it; the batch reads the rest through the scoped calls.
     */
    async claimDueForWorker(now: Date): Promise<{ workspace_id: string; id: string } | null> {
      const rows = await db<{ workspace_id: string; id: string }[]>`
        SELECT workspace_id, id FROM import_jobs
        WHERE status IN ('validating', 'committing') AND next_attempt_at <= GREATEST(${now}::timestamptz, now())
        ORDER BY next_attempt_at, updated_at, id
        LIMIT 1 FOR UPDATE SKIP LOCKED`;
      return rows[0] ?? null;
    },

    /** The rows a dry-run batch still has to plan for `version`, in file order. */
    async rowsToPlan(workspaceId: string, importId: string, version: number, limit: number): Promise<ImportRowRecord[]> {
      return db<ImportRowRecord[]>`
        SELECT row_number, cells, email, external_id FROM import_rows
        WHERE workspace_id = ${workspaceId} AND import_id = ${importId} AND plan_version IS DISTINCT FROM ${version}
        ORDER BY row_number LIMIT ${limit}`;
    },

    /** The rows a commit batch still has to apply, in file order. */
    async rowsToCommit(workspaceId: string, importId: string, limit: number): Promise<ImportRowRecord[]> {
      return db<ImportRowRecord[]>`
        SELECT row_number, cells, email, external_id FROM import_rows
        WHERE workspace_id = ${workspaceId} AND import_id = ${importId} AND outcome IS NULL
        ORDER BY row_number LIMIT ${limit}`;
    },

    /** The first row of the file carrying each of these addresses and external ids. */
    async firstRows(workspaceId: string, importId: string, emails: string[], externalIds: string[]) {
      const byEmail = await db<{ key: string; first: number }[]>`
        SELECT email AS key, min(row_number)::int AS first FROM import_rows
        WHERE workspace_id = ${workspaceId} AND import_id = ${importId} AND email = ANY(${emails})
        GROUP BY email`;
      const byExternal = externalIds.length
        ? await db<{ key: string; first: number }[]>`
            SELECT external_id AS key, min(row_number)::int AS first FROM import_rows
            WHERE workspace_id = ${workspaceId} AND import_id = ${importId} AND external_id = ANY(${externalIds})
            GROUP BY external_id`
        : [];
      return {
        email: new Map(byEmail.map((r) => [r.key, r.first])),
        externalId: new Map(byExternal.map((r) => [r.key, r.first])),
      };
    },

    /** The workspace's contacts with these addresses or external ids, with their topic and tag ids. */
    async existingContacts(workspaceId: string, emails: string[], externalIds: string[]): Promise<ExistingContact[]> {
      return db<ExistingContact[]>`
        SELECT c.id, c.email, c.external_id, c.first_name, c.last_name, c.locale, c.properties,
          COALESCE((SELECT array_agg(s.topic_id) FROM contact_topic_subscriptions s WHERE s.contact_id = c.id), ARRAY[]::uuid[]) AS topic_ids,
          COALESCE((SELECT array_agg(ct.tag_id) FROM contact_tags ct WHERE ct.contact_id = c.id), ARRAY[]::uuid[]) AS tag_ids
        FROM contacts c
        WHERE c.workspace_id = ${workspaceId} AND (c.email = ANY(${emails}) OR c.external_id = ANY(${externalIds}))`;
    },

    /** The suppressions of these addresses, as blocks per address. */
    async blocks(workspaceId: string, emails: string[]): Promise<Map<string, Blocks>> {
      const rows = await db<{ email: string; topic_id: string | null; reason: string }[]>`
        SELECT email, topic_id, reason FROM suppressions WHERE workspace_id = ${workspaceId} AND email = ANY(${emails})`;
      const out = new Map<string, Blocks>();
      for (const r of rows) {
        const b = out.get(r.email) ?? { all: null, topics: new Set<string>() };
        if (r.topic_id === null) b.all = r.reason;
        else b.topics.add(r.topic_id);
        out.set(r.email, b);
      }
      return out;
    },

    async savePlans(workspaceId: string, importId: string, version: number, results: RowResult[]): Promise<void> {
      if (results.length === 0) return;
      await db`
        UPDATE import_rows r SET plan_version = ${version}, plan_outcome = x.outcome, plan_reason = x.reason,
          plan_message = x.message, plan_withheld = x.withheld
        FROM jsonb_to_recordset(${asJson(db, results)}::jsonb)
          AS x(row_number integer, outcome text, reason text, message text, withheld boolean)
        WHERE r.workspace_id = ${workspaceId} AND r.import_id = ${importId} AND r.row_number = x.row_number`;
    },

    async saveOutcomes(workspaceId: string, importId: string, results: RowResult[]): Promise<void> {
      if (results.length === 0) return;
      await db`
        UPDATE import_rows r SET outcome = x.outcome, reason = x.reason, message = x.message, withheld = x.withheld,
          contact_id = x.contact_id
        FROM jsonb_to_recordset(${asJson(db, results)}::jsonb)
          AS x(row_number integer, outcome text, reason text, message text, withheld boolean, contact_id uuid)
        WHERE r.workspace_id = ${workspaceId} AND r.import_id = ${importId} AND r.row_number = x.row_number
          AND r.outcome IS NULL`;
    },

    /** The dry-run report of `version` and how many rows it has planned. */
    async planReport(workspaceId: string, importId: string, version: number): Promise<{ report: ImportReport; processed: number }> {
      const groups = await db<{ outcome: ImportRowOutcome; reason: ImportSkipReason | null; n: number; w: number }[]>`
        SELECT plan_outcome AS outcome, plan_reason AS reason, count(*)::int AS n, count(*) FILTER (WHERE plan_withheld)::int AS w
        FROM import_rows WHERE workspace_id = ${workspaceId} AND import_id = ${importId} AND plan_version = ${version}
        GROUP BY 1, 2`;
      return { report: toReport(groups), processed: groups.reduce((n, g) => n + g.n, 0) };
    },

    /** The report of the rows committed so far. */
    async commitReport(workspaceId: string, importId: string): Promise<{ report: ImportReport; processed: number }> {
      const groups = await db<{ outcome: ImportRowOutcome; reason: ImportSkipReason | null; n: number; w: number }[]>`
        SELECT outcome, reason, count(*)::int AS n, count(*) FILTER (WHERE withheld)::int AS w
        FROM import_rows WHERE workspace_id = ${workspaceId} AND import_id = ${importId} AND outcome IS NOT NULL
        GROUP BY 1, 2`;
      return { report: toReport(groups), processed: groups.reduce((n, g) => n + g.n, 0) };
    },

    async saveProgress(
      workspaceId: string,
      importId: string,
      progress: { dryRun?: ImportReport | null; result?: ImportReport; processed: number; status?: ImportStatus },
    ): Promise<void> {
      await db`
        UPDATE import_jobs SET
          processed_rows = ${progress.processed},
          dry_run = ${progress.dryRun === undefined ? db`dry_run` : progress.dryRun === null ? null : db`${asJson(db, progress.dryRun)}::jsonb`},
          result = ${progress.result === undefined ? db`result` : db`${asJson(db, progress.result)}::jsonb`},
          status = ${progress.status ?? db`status`},
          failures = 0, last_failure = NULL, updated_at = now()
        WHERE workspace_id = ${workspaceId} AND id = ${importId}`;
    },

    /** Records a failed batch; the job waits until `retryAt`. Returns the failure count. */
    async recordFailure(workspaceId: string, importId: string, message: string, retryAt: Date): Promise<number> {
      const rows = await db<{ failures: number }[]>`
        UPDATE import_jobs SET failures = failures + 1, last_failure = ${message}, next_attempt_at = ${retryAt}, updated_at = now()
        WHERE workspace_id = ${workspaceId} AND id = ${importId} AND status IN ('validating', 'committing')
        RETURNING failures`;
      return rows[0]?.failures ?? 0;
    },

    /**
     * Rows of the dry run of `version` (when given) or of the commit, in file
     * order after `afterRow`.
     */
    async listRows(
      workspaceId: string,
      importId: string,
      query: { phase: 'plan'; version: number } | { phase: 'commit' },
      page: { afterRow?: number; limit: number; outcome?: ImportRowOutcome },
    ): Promise<ImportRowView[]> {
      const plan = query.phase === 'plan';
      return db<ImportRowView[]>`
        SELECT row_number AS row, email,
          ${plan ? db`plan_outcome` : db`outcome`} AS outcome,
          ${plan ? db`plan_reason` : db`reason`} AS reason,
          ${plan ? db`plan_message` : db`message`} AS message,
          ${plan ? db`NULL::uuid` : db`contact_id`} AS contact_id
        FROM import_rows
        WHERE workspace_id = ${workspaceId} AND import_id = ${importId}
          ${query.phase === 'plan' ? db`AND plan_version = ${query.version}` : db`AND outcome IS NOT NULL`}
          ${page.outcome ? (plan ? db`AND plan_outcome = ${page.outcome}` : db`AND outcome = ${page.outcome}`) : db``}
          ${page.afterRow !== undefined ? db`AND row_number > ${page.afterRow}` : db``}
        ORDER BY row_number LIMIT ${page.limit}`;
    },

    async rowExists(workspaceId: string, importId: string, rowNumber: number): Promise<boolean> {
      const rows = await db`
        SELECT 1 FROM import_rows WHERE workspace_id = ${workspaceId} AND import_id = ${importId} AND row_number = ${rowNumber}`;
      return rows.length > 0;
    },

    /** One consent record per topic the import newly subscribed the contact to. */
    async recordConsents(
      workspaceId: string,
      input: { contactId: string; topicIds: string[]; importId: string; statedBy: AuditActor; statedAt: string },
    ): Promise<void> {
      if (input.topicIds.length === 0) return;
      await db`
        INSERT INTO contact_consents (workspace_id, contact_id, topic_id, source, import_id, stated_by, confirmed_at)
        SELECT ${workspaceId}, ${input.contactId}, t, 'import', ${input.importId}, ${asJson(db, input.statedBy)}, ${input.statedAt}
        FROM unnest(${input.topicIds}::uuid[]) AS t`;
    },
  };
}
