import type { AuditActor, ImportReport } from '@marlinjai/mail-contract';
import type { Db, Sql } from '../db.js';
import { emitEvent } from '../events.js';
import type { PlatformJob } from '../platform/worker.js';
import type { ImportJobRow, ImportRowRecord, RowResult } from '../repo/imports.js';
import { repos } from '../repo/index.js';
import { evaluateRow, type EvaluationContext, type ExistingContact, type Plan, type ResolvedMapping } from './evaluate.js';

/**
 * The import's background work, one batch per tick: a dry-run batch for an
 * import in `validating`, a commit batch for one in `committing`.
 *
 * A batch runs in one transaction that holds the import's row lock (taken with
 * `FOR UPDATE SKIP LOCKED`, so workers on other instances pick other imports).
 * A route that changes the import (a new mapping, a cancel) locks the same row,
 * so it waits for the batch in flight and the batch never sees a half-changed
 * import. A commit batch writes the contacts and the rows' outcomes together:
 * a crash rolls back the whole batch, and the next tick starts again at the
 * first row without an outcome, so every row is applied exactly once.
 *
 * A batch that throws is recorded as a failure and retried after a backoff;
 * `maxFailures` failures in a row fail the import (`import.finished`, status
 * `failed`). A batch that commits resets the count.
 */

export type ImportJobOptions = {
  sql: Sql;
  batchSize?: number;
  maxFailures?: number;
  log?: Pick<Console, 'error'>;
  /**
   * Called inside a commit batch after each row is written (tests use it to
   * crash a batch halfway). A throw rolls the batch back.
   */
  afterRowWritten?: (importId: string, rowNumber: number) => void;
};

export const IMPORT_BATCH_SIZE = 500;
export const IMPORT_MAX_FAILURES = 5;
const ACTOR: AuditActor = { type: 'system', reason: 'CSV import' };

/** Resolves the stored mapping against the file's header. */
export function resolveMapping(columns: readonly string[], mapping: Record<string, string>): ResolvedMapping {
  const resolved: ResolvedMapping = { email: -1, fields: {}, properties: [], columnOf: new Map() };
  for (const [column, target] of Object.entries(mapping)) {
    const index = columns.indexOf(column);
    if (index < 0 || target === 'ignore') continue;
    resolved.columnOf.set(index, column);
    if (target === 'email') resolved.email = index;
    else if (target.startsWith('property:')) resolved.properties.push({ key: target.slice('property:'.length), index, column });
    else resolved.fields[target as keyof ResolvedMapping['fields']] = index;
  }
  return resolved;
}

function backoffMs(failures: number): number {
  return Math.min(300_000, 1_000 * 2 ** failures);
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function createImportJob(options: ImportJobOptions): PlatformJob {
  const { sql } = options;
  const batchSize = options.batchSize ?? IMPORT_BATCH_SIZE;
  const maxFailures = options.maxFailures ?? IMPORT_MAX_FAILURES;
  const log = options.log ?? console;

  /** Everything a batch needs to evaluate its rows, read once per batch. */
  async function context(tx: Db, job: ImportJobRow, rows: ImportRowRecord[]): Promise<EvaluationContext> {
    const r = repos(tx);
    const ws = job.workspace_id;
    const emails = [...new Set(rows.map((x) => x.email).filter((e): e is string => e !== null))];
    const externalIds = [...new Set(rows.map((x) => x.external_id).filter((e): e is string => e !== null))];
    const [topics, tags, types, existing, blocks, first] = await Promise.all([
      r.topics.bySlugs(ws, job.topics),
      r.tags.bySlugs(ws, job.tags),
      r.contactProperties.types(ws),
      r.imports.existingContacts(ws, emails, externalIds),
      r.imports.blocks(ws, emails),
      r.imports.firstRows(ws, job.id, emails, externalIds),
    ]);
    const byEmail = new Map<string, ExistingContact>();
    const byExternalId = new Map<string, ExistingContact>();
    for (const c of existing) {
      byEmail.set(c.email, c);
      if (c.external_id) byExternalId.set(c.external_id, c);
    }
    return {
      columnCount: job.columns.length,
      mapping: resolveMapping(job.columns, job.mapping!),
      updateExisting: job.update_existing,
      topicIds: topics.map((t) => t.id),
      tagIds: tags.map((t) => t.id),
      propertyTypes: types,
      byEmail,
      byExternalId,
      blocks,
      firstRowOfEmail: first.email,
      firstRowOfExternalId: first.externalId,
    };
  }

  const toResult = (row: ImportRowRecord, plan: Plan, contactId: string | null): RowResult => ({
    row_number: row.row_number,
    outcome: plan.outcome,
    reason: plan.reason,
    message: plan.message,
    withheld: plan.withheld,
    contact_id: contactId,
  });

  async function dryRunBatch(tx: Db, job: ImportJobRow): Promise<void> {
    const r = repos(tx);
    const rows = await r.imports.rowsToPlan(job.workspace_id, job.id, job.mapping_version, batchSize);
    if (rows.length > 0) {
      const ctx = await context(tx, job, rows);
      await r.imports.savePlans(
        job.workspace_id,
        job.id,
        job.mapping_version,
        rows.map((row) => toResult(row, evaluateRow(ctx, row.row_number, row.cells), null)),
      );
    }
    const { report, processed } = await r.imports.planReport(job.workspace_id, job.id, job.mapping_version);
    const done = processed >= job.total_rows;
    await r.imports.saveProgress(job.workspace_id, job.id, {
      processed,
      dryRun: done ? report : null,
      status: done ? 'validated' : undefined,
    });
  }

  async function commitBatch(tx: Db, job: ImportJobRow): Promise<void> {
    const r = repos(tx);
    const ws = job.workspace_id;
    const rows = await r.imports.rowsToCommit(ws, job.id, batchSize);
    if (rows.length > 0) {
      const ctx = await context(tx, job, rows);
      const results: RowResult[] = [];
      for (const row of rows) {
        const plan = evaluateRow(ctx, row.row_number, row.cells);
        const contactId = await apply(tx, job, plan);
        results.push(toResult(row, plan, contactId));
        options.afterRowWritten?.(job.id, row.row_number);
      }
      await r.imports.saveOutcomes(ws, job.id, results);
    }
    const { report, processed } = await r.imports.commitReport(ws, job.id);
    await r.imports.saveProgress(ws, job.id, { processed, result: report });
    if (processed >= job.total_rows) {
      const finished = await r.imports.finish(ws, job.id, 'completed');
      await announce(tx, finished, report);
    }
  }

  /** Writes one row's plan. Returns the contact it names (null for a skipped row). */
  async function apply(tx: Db, job: ImportJobRow, plan: Plan): Promise<string | null> {
    const write = plan.write;
    if (!write) return plan.contactId;
    const r = repos(tx);
    const ws = job.workspace_id;
    let contactId: string;
    if (write.kind === 'create') {
      const inserted = await r.contacts.insert(ws, {
        email: write.email,
        externalId: write.values.external_id ?? null,
        firstName: write.values.first_name ?? null,
        lastName: write.values.last_name ?? null,
        locale: write.values.locale ?? null,
        properties: write.properties,
      });
      // Someone created the contact since this batch read the database: the
      // batch is rolled back and retried, and then reads it as existing.
      if (!inserted) throw new Error(`the contact ${write.email} was created concurrently; the batch is retried`);
      contactId = inserted.id;
    } else {
      contactId = write.contactId;
      const hasValues = Object.keys(write.values).length > 0 || Object.keys(write.properties).length > 0;
      if (hasValues) {
        const updated = await r.contacts.update(ws, contactId, {
          externalId: write.values.external_id,
          firstName: write.values.first_name,
          lastName: write.values.last_name,
          locale: write.values.locale,
          properties: Object.keys(write.properties).length > 0 ? write.properties : undefined,
        });
        if (!updated) throw new Error(`the contact ${contactId} was erased concurrently; the batch is retried`);
      }
    }
    for (const topicId of write.topicIds) await r.contacts.subscribe(ws, contactId, topicId);
    await r.tags.assign(ws, write.tagIds, [contactId]);
    await r.imports.recordConsents(ws, {
      contactId,
      topicIds: write.topicIds,
      importId: job.id,
      statedBy: job.consent_stated_by!,
      statedAt: job.consent_stated_at!,
    });
    return contactId;
  }

  return {
    name: 'imports',
    async tick(now: Date): Promise<boolean> {
      let claimed: { workspace_id: string; id: string } | null = null;
      try {
        return (await sql.begin(async (tx) => {
          const r = repos(tx);
          claimed = await r.imports.claimDueForWorker(now);
          if (!claimed) return false;
          const job = (await r.imports.get(claimed.workspace_id, claimed.id))!;
          if (job.status === 'validating') await dryRunBatch(tx, job);
          else await commitBatch(tx, job);
          return true;
        })) as boolean;
      } catch (err) {
        if (!claimed) throw err;
        const { workspace_id: ws, id } = claimed as { workspace_id: string; id: string };
        log.error(`[imports] a batch of import ${id} failed:`, err);
        await recordFailure(ws, id, errorText(err), now);
        return false;
      }
    },
  };

  async function recordFailure(ws: string, id: string, message: string, now: Date): Promise<void> {
    await sql.begin(async (tx) => {
      const r = repos(tx);
      const job = await r.imports.lock(ws, id);
      if (!job || (job.status !== 'validating' && job.status !== 'committing')) return;
      const failures = await r.imports.recordFailure(ws, id, message, new Date(now.getTime() + backoffMs(job.failures + 1)));
      if (failures < maxFailures) return;
      const error = `Stopped after ${failures} failed attempts in a row. The last one: ${message}`;
      const failed = await r.imports.finish(ws, id, 'failed', error);
      await announce(tx, failed, failed.result);
    });
  }
}

/**
 * The end of an import, in the transaction that ends it: the audit row and the
 * `import.finished` event. Exported for the cancel route.
 */
export async function announce(tx: Db, job: ImportJobRow, result: ImportReport | null, actor: AuditActor = ACTOR): Promise<void> {
  const status = job.status as 'completed' | 'cancelled' | 'failed';
  await repos(tx).audit.record(job.workspace_id, {
    action: 'import.finished',
    actor,
    targetType: 'import',
    targetId: job.id,
    details: { status, result, error: job.error },
  });
  await emitEvent(tx, job.workspace_id, {
    type: 'import.finished',
    data: { import_id: job.id, status, result, error: job.error, finished_at: job.finished_at! },
  });
}
