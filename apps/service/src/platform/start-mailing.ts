import { assertProviderOpen } from '../worker/breaker.js';
import {
  missingRequiredMergeFields,
  testGroupSize,
  type AbTestState,
  type AuditActor,
  type TemplateDocument,
} from '@marlinjai/mail-contract';
import { ApiError } from '../api-error.js';
import { assertCanSend, assertFeature } from '../billing/usage.js';
import type { Db } from '../db.js';
import { validateDocument } from '../documents.js';
import { emitEvent } from '../events.js';
import { repos, type Repos } from '../repo/index.js';
import type { MailingRow } from '../repo/mailings.js';
import type { CompiledDocument } from '../routes/mailings.js';
import { effectiveTracking } from './tracking-settings.js';
import { extractLinks } from './tracking.js';

/**
 * Starting a mailing, shared by `mailings.send` and the scheduled release, so
 * a mailing starts the same way whoever starts it:
 *
 * 1. `prepareStart`, outside any transaction (compiling is CPU work in the
 *    compile pool): the document and every A/B variant's document compile
 *    without errors and contain `{{unsubscribe_url}}`.
 * 2. `applyStart`, in the caller's transaction with the mailing locked: the
 *    mailing did not change since step 1 (else `conflict`), its provider still
 *    exists, it has recipients, a metric A/B test still has its tracking. Then
 *    it stores the compiled HTML, fixes the mailing's tracking snapshot, numbers
 *    its links when clicks are tracked, splits the A/B cohorts, moves it to
 *    `sending`, and writes the audit row and the `mailing.started` event.
 *
 * Each failure is the ApiError the send route answers with; the scheduled
 * release turns the same errors into `mailing.schedule_failed`.
 */

/** Compiles under the workspace's asset policy (src/compile/workspace-compile.ts). */
export type Compile = (workspaceId: string, document: TemplateDocument) => Promise<CompiledDocument>;

export type PreparedStart = {
  /** The mailing's `updated_at` the compile saw; a change since means another look is needed. */
  updatedAt: string;
  base: CompiledDocument;
  /** Compiled output per variant key; null for a variant that changes only the subject. */
  variants: Map<string, CompiledDocument | null>;
};

async function compileChecked(compile: Compile, workspaceId: string, document: unknown, variant: string | null): Promise<CompiledDocument> {
  const where = variant === null ? {} : { variant };
  const compiled = await compile(workspaceId, validateDocument(document) as unknown as TemplateDocument);
  if (compiled.errors.length > 0) {
    throw new ApiError('compile_failed', 'The document does not compile.', { errors: compiled.errors, ...where });
  }
  const missing = missingRequiredMergeFields(compiled.html);
  if (missing.length > 0) {
    throw new ApiError(
      'missing_unsubscribe_url',
      'A broadcast must contain {{unsubscribe_url}}, so every recipient can leave the list.',
      { missing, ...where },
    );
  }
  return compiled;
}

export async function prepareStart(compile: Compile, pool: Repos, workspaceId: string, row: MailingRow): Promise<PreparedStart> {
  const base = await compileChecked(compile, workspaceId, row.document, null);
  const variants = new Map<string, CompiledDocument | null>();
  if (row.ab_test) {
    for (const v of await pool.mailingPlatform.variants(workspaceId, row.id)) {
      variants.set(v.key, v.document ? await compileChecked(compile, workspaceId, v.document, v.key) : null);
    }
  }
  return { updatedAt: row.updated_at, base, variants };
}

/** How many recipients the test group gets: the fraction, at least one per variant, at most everyone. */

export async function applyStart(
  tx: Db,
  workspaceId: string,
  row: MailingRow,
  prepared: PreparedStart,
  opts: { trigger: 'send' | 'schedule'; actor: AuditActor; now: Date },
): Promise<MailingRow> {
  const r = repos(tx);
  if (row.updated_at !== prepared.updatedAt) {
    throw new ApiError('conflict', 'The mailing changed while it was being prepared. Send it again.');
  }
  if (!(await r.providers.get(workspaceId, row.provider_id))) {
    throw new ApiError('unknown_provider', "The mailing's provider was deleted. Choose another one.", {
      provider_id: row.provider_id,
    });
  }
  await assertProviderOpen(tx, workspaceId, row.provider_id);
  const counts = await r.mailings.counts(workspaceId, row.id);
  if (counts.total === 0) throw new ApiError('mailing_not_ready', 'The mailing has no recipients yet.');

  // S5: the whole audience must fit the plan's period, or the mailing does not
  // start (once started it always finishes). An A/B test needs the plan's
  // A/B testing, and tracking is only switched on for a mailing whose plan
  // includes it (the workspace may have moved to a plan without it).
  await assertCanSend(tx, workspaceId, counts.queued, opts.now);
  const ab = row.ab_test;
  if (ab) await assertFeature(tx, workspaceId, 'ab_testing');
  const wanted = await effectiveTracking(tx, workspaceId);
  const planTracks = wanted.opens || wanted.clicks ? await hasFeature(tx, workspaceId, 'tracking') : false;
  const tracking = { opens: wanted.opens && planTracks, clicks: wanted.clicks && planTracks };
  if (ab && ab.winner_metric !== 'manual' && !tracking[ab.winner_metric]) {
    throw new ApiError(
      'tracking_disabled',
      `The A/B test picks its winner by ${ab.winner_metric}, which this workspace no longer tracks. Pick the winner manually (winner_metric: manual) or turn tracking on.`,
      { winner_metric: ab.winner_metric },
    );
  }

  await r.mailings.setCompiled(workspaceId, row.id, { mjml: prepared.base.mjml, html: prepared.base.html });
  for (const [key, compiled] of prepared.variants) {
    if (compiled) await r.mailingPlatform.setVariantCompiled(workspaceId, row.id, key, { mjml: compiled.mjml, html: compiled.html });
  }
  await r.mailingPlatform.setTracking(workspaceId, row.id, tracking);
  if (tracking.clicks) {
    const urls = extractLinks(prepared.base.html);
    for (const compiled of prepared.variants.values()) {
      if (compiled) for (const url of extractLinks(compiled.html)) if (!urls.includes(url)) urls.push(url);
    }
    await r.mailingPlatform.addLinks(workspaceId, row.id, urls);
  }

  if (ab) {
    const keys = ab.variants.map((v) => v.key);
    const size = testGroupSize(counts.queued, ab.test_fraction, keys.length);
    await r.mailingPlatform.assignCohorts(workspaceId, row.id, keys, size);
    const state: AbTestState = {
      ...ab,
      status: 'testing',
      decide_at:
        ab.winner_metric === 'manual' || ab.decide_after_minutes === null
          ? null
          : new Date(opts.now.getTime() + ab.decide_after_minutes * 60_000).toISOString(),
    };
    await r.mailingPlatform.setAbTest(workspaceId, row.id, state);
  }

  const moved = await r.mailings.transition(workspaceId, row.id, ['draft', 'scheduled'], 'sending', { startedAt: true });
  if (!moved) {
    throw new ApiError('mailing_invalid_state', `A ${row.status} mailing cannot send.`, { status: row.status, action: 'send' });
  }
  await r.audit.record(workspaceId, {
    action: 'mailing.sent',
    actor: opts.actor,
    targetType: 'mailing',
    targetId: row.id,
    details: { recipients: counts.total, trigger: opts.trigger, tracking, ab_test: ab !== null },
  });
  await emitEvent(tx, workspaceId, {
    type: 'mailing.started',
    data: {
      mailing_id: row.id,
      mailing_metadata: moved.metadata,
      trigger: opts.trigger,
      recipients: counts.total,
      started_at: moved.started_at!,
    },
  });
  return moved;
}

/** Whether the workspace's plan includes a feature, without failing. */
async function hasFeature(db: Db, workspaceId: string, feature: 'tracking' | 'ab_testing'): Promise<boolean> {
  try {
    await assertFeature(db, workspaceId, feature);
    return true;
  } catch (err) {
    if (err instanceof ApiError && err.code === 'plan_limit_reached') return false;
    throw err;
  }
}
