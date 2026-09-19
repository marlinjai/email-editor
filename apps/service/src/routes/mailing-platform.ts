import {
  canTransition,
  EDITABLE_MAILING_STATUSES,
  type AbTestState,
  type MailingAnalytics,
} from '@marlinjai/mail-contract';
import { Hono } from 'hono';
import { ApiError } from '../api-error.js';
import { assertFeature } from '../billing/usage.js';
import { actorOf, type AppEnv, type WorkspaceAccess } from '../context.js';
import type { Db, Sql } from '../db.js';
import { validateDocument } from '../documents.js';
import { emitEvent } from '../events.js';
import { mount, type MountDeps } from '../mount.js';
import { decideWinner, variantResults } from '../platform/ab-decide.js';
import { prepareStart, type Compile } from '../platform/start-mailing.js';
import { effectiveTracking } from '../platform/tracking-settings.js';
import { repos, type Repos } from '../repo/index.js';
import type { MailingRow } from '../repo/mailings.js';
import { body, params, rowId } from '../validate.js';
import { toMailing } from './mailings.js';

/** How far ahead a mailing may be scheduled. */
export const MAX_SCHEDULE_AHEAD_MS = 366 * 24 * 3600 * 1000;

export type MailingPlatformDeps = MountDeps & { compile: Compile; now?: () => Date };

function notFound(): never {
  throw new ApiError('not_found', 'No such mailing in this workspace.');
}

function invalidState(row: MailingRow, action: string): never {
  throw new ApiError('mailing_invalid_state', `A ${row.status} mailing cannot ${action}.`, { status: row.status, action });
}

/**
 * S4 on mailings: scheduling, the A/B test, analytics, and the workspace's
 * tracking settings.
 *
 * - `schedule` runs every check `send` runs (it compiles, has
 *   `{{unsubscribe_url}}`, recipients, its provider, the tracking a metric test
 *   needs) before it accepts a time, so a scheduled mailing does not fail at its
 *   time for a reason known now. The platform worker starts it at `scheduled_at`
 *   (src/platform/schedule-job.ts); `schedule` again moves it, `unschedule`
 *   returns it to `draft`.
 * - The A/B test is set while the mailing is editable; its variants' documents
 *   are validated now and compiled when sending starts. A test decided by opens
 *   or clicks needs that tracking on the workspace (`tracking_disabled`).
 * - `pickAbWinner` decides a running test by hand (any metric), once.
 */
export function mailingPlatformRoutes(sql: Sql, deps: MailingPlatformDeps) {
  const app = new Hono<AppEnv>();
  const { pool } = deps;
  const now = deps.now ?? (() => new Date());

  const respond = async (db: Db, workspaceId: string, row: MailingRow) =>
    toMailing(row, await repos(db).mailings.counts(workspaceId, row.id));

  async function withLocked(access: WorkspaceAccess, id: string, fn: (r: Repos, tx: Db, row: MailingRow) => Promise<void>) {
    return sql.begin(async (tx) => {
      const r = repos(tx);
      const row = await r.mailings.lock(access.workspaceId, id);
      if (!row) notFound();
      await fn(r, tx, row);
      return respond(tx, access.workspaceId, (await r.mailings.get(access.workspaceId, id))!);
    });
  }

  const idOf = (c: Parameters<Parameters<typeof mount>[3]>[0]) => rowId(params(c, 'mailings.get').id, 'mailing');

  mount(app, 'mailings.schedule', deps, async (c) => {
    const access = c.get('access');
    const id = idOf(c);
    const input = await body(c, 'mailings.schedule');
    const at = new Date(input.send_at);
    const current = now();
    if (at.getTime() <= current.getTime()) {
      throw new ApiError('validation_failed', 'send_at must lie in the future.', {
        issues: [{ path: ['send_at'], message: 'must lie in the future' }],
      });
    }
    if (at.getTime() - current.getTime() > MAX_SCHEDULE_AHEAD_MS) {
      throw new ApiError('validation_failed', 'send_at must lie within a year.', {
        issues: [{ path: ['send_at'], message: 'must lie within a year' }],
      });
    }
    const row = await pool.mailings.get(access.workspaceId, id);
    if (!row) notFound();
    if (!canTransition(row.status, 'schedule')) invalidState(row, 'schedule');
    // The checks `send` makes, now, so the time does not bring a surprise.
    await prepareStart(deps.compile, pool, access.workspaceId, row);
    const mailing = await withLocked(access, id, async (r, tx, locked) => {
      if (!canTransition(locked.status, 'schedule')) invalidState(locked, 'schedule');
      if (!(await r.providers.get(access.workspaceId, locked.provider_id))) {
        throw new ApiError('unknown_provider', "The mailing's provider was deleted. Choose another one.", {
          provider_id: locked.provider_id,
        });
      }
      if ((await r.mailings.counts(access.workspaceId, id)).total === 0) {
        throw new ApiError('mailing_not_ready', 'The mailing has no recipients yet.');
      }
      await requireMetricTracking(tx, access.workspaceId, locked.ab_test);
      await r.mailingPlatform.setSchedule(access.workspaceId, id, ['draft', 'scheduled'], { status: 'scheduled', at });
      await r.audit.record(access.workspaceId, {
        action: 'mailing.scheduled',
        actor: actorOf(access),
        targetType: 'mailing',
        targetId: id,
        details: { scheduled_at: at.toISOString(), previous: locked.scheduled_at },
      });
      await emitEvent(tx, access.workspaceId, {
        type: 'mailing.scheduled',
        data: { mailing_id: id, mailing_metadata: locked.metadata, scheduled_at: at.toISOString() },
      });
    });
    return c.json(mailing);
  });

  mount(app, 'mailings.unschedule', deps, async (c) => {
    const access = c.get('access');
    const id = idOf(c);
    await body(c, 'mailings.unschedule');
    const mailing = await withLocked(access, id, async (r, tx, row) => {
      if (!canTransition(row.status, 'unschedule')) invalidState(row, 'unschedule');
      await r.mailingPlatform.setSchedule(access.workspaceId, id, ['scheduled'], { status: 'draft' });
      await r.audit.record(access.workspaceId, {
        action: 'mailing.unscheduled',
        actor: actorOf(access),
        targetType: 'mailing',
        targetId: id,
        details: { previous: row.scheduled_at },
      });
      await emitEvent(tx, access.workspaceId, {
        type: 'mailing.scheduled',
        data: { mailing_id: id, mailing_metadata: row.metadata, scheduled_at: null },
      });
    });
    return c.json(mailing);
  });

  mount(app, 'mailings.setAbTest', deps, async (c) => {
    const access = c.get('access');
    const id = idOf(c);
    const input = await body(c, 'mailings.setAbTest');
    // The editor core's full schema for every variant document, before any lock.
    const variants = input.variants.map((v, i) => {
      let document: Record<string, unknown> | null = null;
      if (v.document !== undefined) {
        try {
          document = validateDocument(v.document) as unknown as Record<string, unknown>;
        } catch (err) {
          if (err instanceof ApiError) {
            throw new ApiError(err.code, `Variant ${v.key}: ${err.message}`, { ...(err.details ?? {}), variant: v.key, index: i });
          }
          throw err;
        }
      }
      return { key: v.key, subject: v.subject ?? null, document, keep: v.keep_document === true, index: i };
    });
    const stateOf = (resolved: ReadonlyArray<{ key: string; subject: string | null; document: Record<string, unknown> | null }>): AbTestState => ({
      variants: resolved.map((v) => ({ key: v.key, subject: v.subject, has_document: v.document !== null })),
      test_fraction: input.test_fraction,
      winner_metric: input.winner_metric,
      decide_after_minutes: input.decide_after_minutes ?? null,
      status: 'pending',
      decide_at: null,
      winner: null,
      decided_by: null,
      decided_at: null,
    });
    const mailing = await withLocked(access, id, async (r, tx, row) => {
      if (!EDITABLE_MAILING_STATUSES.includes(row.status)) {
        throw new ApiError('mailing_invalid_state', `The A/B test of a ${row.status} mailing can no longer change.`, {
          status: row.status,
        });
      }
      await assertFeature(tx, access.workspaceId, 'ab_testing');
      // `keep_document` takes the document the variant has now, under the lock.
      const current = variants.some((v) => v.keep) ? await r.mailingPlatform.variants(access.workspaceId, id) : [];
      const resolved = variants.map((v) => {
        if (!v.keep) return { key: v.key, subject: v.subject, document: v.document };
        const kept = current.find((c) => c.key === v.key)?.document ?? null;
        if (!kept) {
          throw new ApiError('validation_failed', `Variant ${v.key} has no content of its own to keep.`, {
            issues: [{ path: ['variants', v.index, 'keep_document'], message: 'this variant has no document of its own' }],
          });
        }
        return { key: v.key, subject: v.subject, document: kept as Record<string, unknown> };
      });
      const state = stateOf(resolved);
      await requireMetricTracking(tx, access.workspaceId, state);
      await r.mailingPlatform.replaceVariants(access.workspaceId, id, resolved);
      await r.mailingPlatform.setAbTest(access.workspaceId, id, state);
      await r.audit.record(access.workspaceId, {
        action: 'mailing.ab_test_updated',
        actor: actorOf(access),
        targetType: 'mailing',
        targetId: id,
        details: {
          variants: state.variants.map((v) => v.key),
          test_fraction: state.test_fraction,
          winner_metric: state.winner_metric,
          decide_after_minutes: state.decide_after_minutes,
        },
      });
    });
    return c.json(mailing);
  });

  mount(app, 'mailings.clearAbTest', deps, async (c) => {
    const access = c.get('access');
    const id = idOf(c);
    const mailing = await withLocked(access, id, async (r, _tx, row) => {
      if (!EDITABLE_MAILING_STATUSES.includes(row.status)) {
        throw new ApiError('mailing_invalid_state', `The A/B test of a ${row.status} mailing can no longer change.`, {
          status: row.status,
        });
      }
      if (!row.ab_test) return;
      await r.mailingPlatform.replaceVariants(access.workspaceId, id, []);
      await r.mailingPlatform.setAbTest(access.workspaceId, id, null);
      await r.audit.record(access.workspaceId, {
        action: 'mailing.ab_test_updated',
        actor: actorOf(access),
        targetType: 'mailing',
        targetId: id,
        details: { cleared: true },
      });
    });
    return c.json(mailing);
  });

  mount(app, 'mailings.pickAbWinner', deps, async (c) => {
    const access = c.get('access');
    const id = idOf(c);
    const input = await body(c, 'mailings.pickAbWinner');
    const mailing = await withLocked(access, id, async (_r, tx, row) => {
      const state = row.ab_test;
      if (!state) throw new ApiError('conflict', 'The mailing has no A/B test.');
      if (state.status === 'pending') {
        throw new ApiError('conflict', 'The A/B test has not started; the winner is picked once the test group is sending.', {
          status: state.status,
        });
      }
      if (state.status === 'decided') {
        throw new ApiError('conflict', `The A/B test is already decided (variant ${state.winner}).`, {
          status: state.status,
          winner: state.winner,
        });
      }
      if (row.status === 'cancelled') invalidState(row, 'pick an A/B winner');
      if (!state.variants.some((v) => v.key === input.variant)) {
        throw new ApiError('validation_failed', `No variant "${input.variant}" in this test.`, {
          issues: [{ path: ['variant'], message: `one of ${state.variants.map((v) => v.key).join(', ')}` }],
        });
      }
      await decideWinner(tx, access.workspaceId, row, input.variant, 'manual', actorOf(access), now());
    });
    return c.json(mailing);
  });

  mount(app, 'mailings.analytics', deps, async (c) => {
    const { workspaceId } = c.get('access');
    const id = idOf(c);
    const row = await pool.mailings.get(workspaceId, id);
    if (!row) notFound();
    const counts = await pool.mailings.counts(workspaceId, id);
    const outcomes = await pool.mailingPlatform.outcomes(workspaceId, id);
    const tracking = row.tracking;
    const opens = tracking?.opens === true;
    const clicks = tracking?.clicks === true;
    const overall = (await pool.mailingPlatform.engagement(workspaceId, id)).find((e) => e.overall);
    const analytics: MailingAnalytics = {
      mailing_id: id,
      counts,
      tracking,
      unique_opens: opens ? (overall?.unique_opens ?? 0) : null,
      apple_mpp_opens: opens ? (overall?.apple_mpp_only ?? 0) : null,
      machine_events: opens || clicks ? (overall?.machine_events ?? 0) : null,
      unique_clicks: clicks ? (overall?.unique_clicks ?? 0) : null,
      ...outcomes,
      links: clicks ? await pool.mailingPlatform.linkClicks(workspaceId, id) : null,
      variants: row.ab_test ? await variantResults(sql, workspaceId, row) : null,
    };
    return c.json(analytics);
  });

  mount(app, 'tracking.get', deps, async (c) => {
    const { workspaceId } = c.get('access');
    return c.json(await pool.workspaceTracking.get(workspaceId));
  });

  mount(app, 'tracking.update', deps, async (c) => {
    const access = c.get('access');
    const input = await body(c, 'tracking.update');
    const result = await sql.begin(async (tx) => {
      const r = repos(tx);
      const workspace = await r.workspaces.get(access.workspaceId);
      if (!workspace) throw new ApiError('not_found', 'No such workspace.');
      const before = await r.workspaceTracking.get(access.workspaceId);
      // S5: turning tracking on needs a plan that includes it; turning it off never does.
      if ((input.opens && !before.opens) || (input.clicks && !before.clicks)) {
        await assertFeature(tx, access.workspaceId, 'tracking');
      }
      await r.workspaceTracking.set(access.workspaceId, input);
      // The master switch follows, so `workspace.get` tells the truth.
      await r.workspaces.update(access.workspaceId, {
        settings: { ...workspace.settings, tracking_enabled: input.opens || input.clicks },
      });
      await r.audit.record(access.workspaceId, {
        action: 'tracking.updated',
        actor: actorOf(access),
        targetType: 'workspace',
        targetId: access.workspaceId,
        details: { before, after: input },
      });
      return input;
    });
    return c.json(result);
  });

  return app;
}

/** A test decided by opens or clicks needs that tracking on the workspace; the contract answers `tracking_disabled`. */
async function requireMetricTracking(db: Db, workspaceId: string, state: Pick<AbTestState, 'winner_metric'> | null) {
  if (!state || state.winner_metric === 'manual') return;
  const tracking = await effectiveTracking(db, workspaceId);
  if (!tracking[state.winner_metric]) {
    throw new ApiError(
      'tracking_disabled',
      `This workspace does not track ${state.winner_metric}, so the A/B winner cannot be picked by ${state.winner_metric}. Use winner_metric "manual" and pick the winner yourself, or turn ${state.winner_metric} tracking on first.`,
      { winner_metric: state.winner_metric },
    );
  }
}

