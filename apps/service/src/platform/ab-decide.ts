import type { AbTestState, AuditActor, VariantAnalytics } from '@marlinjai/mail-contract';
import type { Db } from '../db.js';
import { emitEvent } from '../events.js';
import { repos } from '../repo/index.js';
import type { MailingRow } from '../repo/mailings.js';

/** Per-variant results of a mailing's test group, in variant order. */
export async function variantResults(db: Db, workspaceId: string, mailing: MailingRow): Promise<VariantAnalytics[]> {
  const rows = await repos(db).mailingPlatform.engagement(workspaceId, mailing.id);
  const opens = mailing.tracking?.opens === true;
  const clicks = mailing.tracking?.clicks === true;
  return (mailing.ab_test?.variants ?? []).map((v) => {
    const row = rows.find((x) => !x.overall && x.key === v.key);
    return {
      key: v.key,
      sent: row?.sent ?? 0,
      unique_opens: opens ? (row?.unique_opens ?? 0) : null,
      unique_clicks: clicks ? (row?.unique_clicks ?? 0) : null,
    };
  });
}

/**
 * The winner by the test's metric: most unique human opens or clicks, a tie to
 * the earlier key. Null when the metric was not tracked for this mailing.
 */
export function pickByMetric(state: AbTestState, results: readonly VariantAnalytics[]): string | null {
  if (state.winner_metric === 'manual') return null;
  const field = state.winner_metric === 'opens' ? 'unique_opens' : 'unique_clicks';
  let best: VariantAnalytics | null = null;
  for (const r of results) {
    const score = r[field];
    if (score === null) return null;
    if (!best || score > best[field]!) best = r;
  }
  return best?.key ?? null;
}

/**
 * Settles the test in the caller's transaction, the mailing locked: records the
 * winner, gives it to every held recipient (who become due at once), and writes
 * the audit row and the `mailing.ab_winner_selected` event. The caller checked
 * the test is still open.
 */
export async function decideWinner(
  tx: Db,
  workspaceId: string,
  mailing: MailingRow,
  winner: string,
  decidedBy: 'metric' | 'manual',
  actor: AuditActor,
  now: Date,
): Promise<number> {
  const r = repos(tx);
  const state = mailing.ab_test!;
  const results = await variantResults(tx, workspaceId, mailing);
  const decided: AbTestState = {
    ...state,
    status: 'decided',
    winner,
    decided_by: decidedBy,
    decided_at: now.toISOString(),
  };
  await r.mailingPlatform.setAbTest(workspaceId, mailing.id, decided);
  const released = await r.mailingPlatform.releaseHeld(workspaceId, mailing.id, winner);
  await r.audit.record(workspaceId, {
    action: 'mailing.ab_winner_selected',
    actor,
    targetType: 'mailing',
    targetId: mailing.id,
    details: { winner, decided_by: decidedBy, released, variants: results },
  });
  await emitEvent(tx, workspaceId, {
    type: 'mailing.ab_winner_selected',
    data: {
      mailing_id: mailing.id,
      mailing_metadata: mailing.metadata,
      winner,
      decided_by: decidedBy,
      variants: results,
      decided_at: decided.decided_at!,
    },
  });
  return released;
}
