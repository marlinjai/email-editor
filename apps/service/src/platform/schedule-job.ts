import type { AuditActor } from '@marlinjai/mail-contract';
import { ApiError } from '../api-error.js';
import type { Sql } from '../db.js';
import { emitEvent } from '../events.js';
import { repos } from '../repo/index.js';
import { applyStart, prepareStart, type Compile } from './start-mailing.js';
import type { PlatformJob } from './worker.js';

const ACTOR: AuditActor = { type: 'system', reason: 'scheduled send' };

/** Errors that say the mailing itself cannot start; anything else (the compile pool full, the database away) is retried. */
const FINAL_ERRORS = new Set(['compile_failed', 'missing_unsubscribe_url', 'mailing_not_ready', 'unknown_provider', 'tracking_disabled', 'validation_failed']);

/**
 * Releases scheduled mailings at their time: the same start as `mailings.send`
 * (src/platform/start-mailing.ts), with trigger `schedule`. State lives in the
 * mailing row, so a restart loses nothing: whatever is due when a process comes
 * up is released on its first tick, even if its time passed while no process
 * ran.
 *
 * A mailing that can no longer start (it was edited into a document that does
 * not compile, its recipients are gone, a metric A/B test lost its tracking)
 * goes back to `draft` with `mailing.schedule_failed` and an audit row saying
 * why; nothing is sent. A passing problem (the compile pool is full, the
 * database is away) leaves it `scheduled` for the next tick.
 */
export function createScheduleJob(deps: { sql: Sql; compile: Compile; log?: Pick<Console, 'error' | 'log'> }): PlatformJob {
  const log = deps.log ?? console;
  const pool = repos(deps.sql);
  return {
    name: 'schedule',
    async tick(now) {
      const due = await pool.mailingPlatform.listDueScheduledForWorker(now, 10);
      let worked = false;
      for (const m of due) {
        const row = await pool.mailings.get(m.workspace_id, m.id);
        if (!row || row.status !== 'scheduled') continue;
        let failure: ApiError | null = null;
        try {
          const prepared = await prepareStart(deps.compile, pool, m.workspace_id, row);
          const started = await deps.sql.begin(async (tx) => {
            const locked = await repos(tx).mailings.lock(m.workspace_id, m.id);
            // Moved, unscheduled or sent since the scan: not ours any more.
            if (!locked || locked.status !== 'scheduled' || !locked.scheduled_at || new Date(locked.scheduled_at) > now) return false;
            await applyStart(tx, m.workspace_id, locked, prepared, { trigger: 'schedule', actor: ACTOR, now });
            return true;
          });
          if (started) {
            worked = true;
            log.log(`[schedule] started mailing ${m.id}`);
          }
        } catch (err) {
          if (err instanceof ApiError && err.code === 'conflict') continue; // edited meanwhile: the next tick looks again
          if (!(err instanceof ApiError) || !FINAL_ERRORS.has(err.code)) throw err;
          failure = err;
        }
        if (failure) {
          const moved = await deps.sql.begin(async (tx) => {
            const r = repos(tx);
            const locked = await r.mailings.lock(m.workspace_id, m.id);
            if (!locked || locked.status !== 'scheduled') return false;
            await r.mailingPlatform.setSchedule(m.workspace_id, m.id, ['scheduled'], { status: 'draft' });
            await r.audit.record(m.workspace_id, {
              action: 'mailing.schedule_failed',
              actor: ACTOR,
              targetType: 'mailing',
              targetId: m.id,
              details: { code: failure!.code, message: failure!.message, scheduled_at: locked.scheduled_at },
            });
            await emitEvent(tx, m.workspace_id, {
              type: 'mailing.schedule_failed',
              data: {
                mailing_id: m.id,
                mailing_metadata: locked.metadata,
                code: failure!.code,
                message: failure!.message,
                failed_at: now.toISOString(),
              },
            });
            return true;
          });
          if (moved) {
            worked = true;
            log.error(`[schedule] mailing ${m.id} could not start at its time (${failure.code}); back to draft`);
          }
        }
      }
      return worked;
    },
  };
}
