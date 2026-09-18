import type { AuditActor } from '@marlinjai/mail-contract';
import type { Sql } from '../db.js';
import { repos } from '../repo/index.js';
import { decideWinner, pickByMetric, variantResults } from './ab-decide.js';
import { effectiveTracking } from './tracking-settings.js';
import type { PlatformJob } from './worker.js';

const ACTOR: AuditActor = { type: 'system', reason: 'A/B test decided by its metric' };

/**
 * Decides A/B tests by their metric once `decide_at` has passed: the variant
 * with the most unique human opens or clicks wins, a tie to the earlier key, and
 * the held rest of the recipients get it. When the metric is no longer tracked
 * (tracking was turned off after the start), the test waits for a person
 * instead (`awaiting_pick`), since a winner picked on missing data is a guess.
 */
export function createAbDecisionJob(deps: { sql: Sql; log?: Pick<Console, 'error' | 'log'> }): PlatformJob {
  const log = deps.log ?? console;
  return {
    name: 'ab-decision',
    async tick(now) {
      const due = await repos(deps.sql).mailingPlatform.listAbDueForWorker(now, 10);
      let worked = false;
      for (const m of due) {
        const done = await deps.sql.begin(async (tx) => {
          const r = repos(tx);
          const row = await r.mailings.lock(m.workspace_id, m.id);
          const state = row?.ab_test;
          if (!row || !state || state.status !== 'testing' || state.winner_metric === 'manual') return false;
          if (!state.decide_at || new Date(state.decide_at) > now) return false;
          const tracked = await effectiveTracking(tx, m.workspace_id);
          const winner = tracked[state.winner_metric] ? pickByMetric(state, await variantResults(tx, m.workspace_id, row)) : null;
          if (!winner) {
            await r.mailingPlatform.setAbTest(m.workspace_id, m.id, { ...state, status: 'awaiting_pick' });
            log.error(`[ab] mailing ${m.id}: ${state.winner_metric} not tracked any more; waiting for a manual pick`);
            return true;
          }
          await decideWinner(tx, m.workspace_id, row, winner, 'metric', ACTOR, now);
          log.log(`[ab] mailing ${m.id}: variant ${winner} won on ${state.winner_metric}`);
          return true;
        });
        if (done) worked = true;
      }
      return worked;
    },
  };
}
