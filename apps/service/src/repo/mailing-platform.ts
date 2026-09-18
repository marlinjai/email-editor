import type { AbTestState, MailingStatus, TrackingSettings } from '@marlinjai/mail-contract';
import type { Db } from '../db.js';
import { asJson } from './json.js';

/*
 * S4 on mailings: scheduling, A/B variants and cohorts, numbered links, and the
 * open and click events. Workspace id first everywhere; the scans the platform
 * worker runs across workspaces end in `ForWorker` and return ids only.
 */

export type VariantRow = {
  key: string;
  subject: string | null;
  document: Record<string, unknown> | null;
  html: string | null;
};

export type TrackingEventInput = {
  mailingId: string;
  recipientId: string;
  contactId: string | null;
  variant: string | null;
  kind: 'open' | 'click';
  linkIdx: number | null;
  isMachine: boolean;
  isAppleMpp: boolean;
};

/** Per-variant (`overall` false, `key` the variant or null for no variant) or overall engagement of one mailing. */
export type EngagementRow = {
  overall: boolean;
  key: string | null;
  sent: number;
  unique_opens: number;
  apple_mpp_only: number;
  unique_clicks: number;
  machine_events: number;
};

export function mailingPlatformRepo(db: Db) {
  return {
    /**
     * Moves the mailing to `to` (`scheduled` with a time, or `draft` without)
     * only from one of `from` (compare-and-set). Returns whether it moved.
     */
    async setSchedule(
      workspaceId: string,
      mailingId: string,
      from: readonly MailingStatus[],
      to: { status: 'scheduled'; at: Date } | { status: 'draft' },
    ): Promise<boolean> {
      const rows = await db`
        UPDATE mailings SET status = ${to.status}, scheduled_at = ${to.status === 'scheduled' ? to.at : null},
          updated_at = now()
        WHERE workspace_id = ${workspaceId} AND id = ${mailingId} AND status = ANY(${from as MailingStatus[]})
        RETURNING id`;
      return rows.length > 0;
    },

    async setAbTest(workspaceId: string, mailingId: string, state: AbTestState | null): Promise<void> {
      await db`
        UPDATE mailings SET ab_test = ${state === null ? null : asJson(db, state)}::jsonb, updated_at = now()
        WHERE workspace_id = ${workspaceId} AND id = ${mailingId}`;
    },

    async setTracking(workspaceId: string, mailingId: string, tracking: TrackingSettings): Promise<void> {
      await db`UPDATE mailings SET tracking = ${asJson(db, tracking)} WHERE workspace_id = ${workspaceId} AND id = ${mailingId}`;
    },

    /** Replaces the mailing's variants with exactly these (none clears them). */
    async replaceVariants(
      workspaceId: string,
      mailingId: string,
      variants: ReadonlyArray<{ key: string; subject: string | null; document: Record<string, unknown> | null }>,
    ): Promise<void> {
      await db`DELETE FROM mailing_variants WHERE workspace_id = ${workspaceId} AND mailing_id = ${mailingId}`;
      if (variants.length === 0) return;
      await db`
        INSERT INTO mailing_variants (workspace_id, mailing_id, key, subject, document)
        SELECT ${workspaceId}, ${mailingId}, x.key, x.subject, x.document
        FROM jsonb_to_recordset(${asJson(db, variants)}::jsonb) AS x(key text, subject text, document jsonb)`;
    },

    async variants(workspaceId: string, mailingId: string): Promise<VariantRow[]> {
      return db<VariantRow[]>`
        SELECT key, subject, document, html FROM mailing_variants
        WHERE workspace_id = ${workspaceId} AND mailing_id = ${mailingId} ORDER BY key`;
    },

    async setVariantCompiled(workspaceId: string, mailingId: string, key: string, compiled: { mjml: string; html: string }) {
      await db`
        UPDATE mailing_variants SET mjml = ${compiled.mjml}, html = ${compiled.html}
        WHERE workspace_id = ${workspaceId} AND mailing_id = ${mailingId} AND key = ${key}`;
    },

    /** Numbers the links in the order given; a URL already numbered keeps its number. */
    async addLinks(workspaceId: string, mailingId: string, urls: readonly string[]): Promise<void> {
      if (urls.length === 0) return;
      await db`
        INSERT INTO mailing_links (workspace_id, mailing_id, idx, url)
        SELECT ${workspaceId}, ${mailingId},
          (SELECT COALESCE(max(idx) + 1, 0) FROM mailing_links WHERE mailing_id = ${mailingId}) + u.n - 1, u.url
        FROM unnest(${urls as string[]}::text[]) WITH ORDINALITY AS u(url, n)
        ON CONFLICT (mailing_id, url) DO NOTHING`;
    },

    async links(workspaceId: string, mailingId: string): Promise<Array<{ idx: number; url: string }>> {
      return db<Array<{ idx: number; url: string }>>`
        SELECT idx, url FROM mailing_links WHERE workspace_id = ${workspaceId} AND mailing_id = ${mailingId} ORDER BY idx`;
    },

    async link(workspaceId: string, mailingId: string, idx: number): Promise<string | null> {
      const rows = await db<{ url: string }[]>`
        SELECT url FROM mailing_links WHERE workspace_id = ${workspaceId} AND mailing_id = ${mailingId} AND idx = ${idx}`;
      return rows[0]?.url ?? null;
    },

    /**
     * Splits the queued recipients for an A/B test: in a stable pseudo-random
     * order (by a hash of the row id), the first `testSize` go round-robin to
     * `keys`, the rest are held for the winner. Returns how many were held.
     */
    async assignCohorts(workspaceId: string, mailingId: string, keys: readonly string[], testSize: number): Promise<number> {
      const rows = await db<{ held: boolean }[]>`
        WITH ordered AS (
          SELECT id, row_number() OVER (ORDER BY md5(id::text), id) - 1 AS n FROM mailing_recipients
          WHERE workspace_id = ${workspaceId} AND mailing_id = ${mailingId} AND status = 'queued'
        )
        UPDATE mailing_recipients r SET
          variant = CASE WHEN o.n < ${testSize} THEN (${keys as string[]}::text[])[(o.n % ${keys.length}) + 1] ELSE NULL END,
          held = o.n >= ${testSize},
          updated_at = now()
        FROM ordered o WHERE r.id = o.id
        RETURNING r.held`;
      return rows.filter((r) => r.held).length;
    },

    /** Gives the held recipients the winner and makes them due now. Returns how many. */
    async releaseHeld(workspaceId: string, mailingId: string, winner: string): Promise<number> {
      const rows = await db`
        UPDATE mailing_recipients SET variant = ${winner}, held = false, next_attempt_at = now(), updated_at = now()
        WHERE workspace_id = ${workspaceId} AND mailing_id = ${mailingId} AND held AND status = 'queued'
        RETURNING id`;
      return rows.length;
    },

    /** Scheduled mailings due at `now`, across workspaces, oldest first. */
    async listDueScheduledForWorker(now: Date, limit: number): Promise<Array<{ workspace_id: string; id: string }>> {
      return db<Array<{ workspace_id: string; id: string }>>`
        SELECT workspace_id, id FROM mailings
        WHERE status = 'scheduled' AND scheduled_at <= ${now}
        ORDER BY scheduled_at, id LIMIT ${limit}`;
    },

    /** Running A/B tests decided by a metric whose time has come, across workspaces. */
    async listAbDueForWorker(now: Date, limit: number): Promise<Array<{ workspace_id: string; id: string }>> {
      return db<Array<{ workspace_id: string; id: string }>>`
        SELECT workspace_id, id FROM mailings
        WHERE status IN ('sending', 'paused') AND ab_test ->> 'status' = 'testing'
          AND ab_test ->> 'winner_metric' <> 'manual' AND (ab_test ->> 'decide_at')::timestamptz <= ${now}
        ORDER BY (ab_test ->> 'decide_at')::timestamptz, id LIMIT ${limit}`;
    },

    async insertEvent(workspaceId: string, e: TrackingEventInput): Promise<void> {
      await db`
        INSERT INTO tracking_events (workspace_id, mailing_id, recipient_id, contact_id, variant, kind, link_idx, is_machine, is_apple_mpp)
        VALUES (${workspaceId}, ${e.mailingId}, ${e.recipientId}, ${e.contactId}, ${e.variant}, ${e.kind}, ${e.linkIdx},
                ${e.isMachine}, ${e.isAppleMpp})`;
    },

    /**
     * Engagement overall (the first row) and per variant. A unique
     * open is a recipient with at least one open that is neither a machine nor
     * Apple Mail Privacy Protection; `apple_mpp_only` counts recipients whose
     * only non-machine opens came from that proxy.
     */
    async engagement(workspaceId: string, mailingId: string): Promise<EngagementRow[]> {
      return db<EngagementRow[]>`
        WITH r AS (
          SELECT id, variant, status FROM mailing_recipients WHERE workspace_id = ${workspaceId} AND mailing_id = ${mailingId}
        ), per AS (
          SELECT r.id, r.variant, r.status,
            bool_or(e.kind = 'open' AND NOT e.is_machine AND NOT e.is_apple_mpp) AS human_open,
            bool_or(e.kind = 'open' AND NOT e.is_machine AND e.is_apple_mpp) AS mpp_open,
            bool_or(e.kind = 'click' AND NOT e.is_machine) AS human_click,
            count(e.id) FILTER (WHERE e.is_machine) AS machine
          FROM r LEFT JOIN tracking_events e ON e.workspace_id = ${workspaceId} AND e.recipient_id = r.id
          GROUP BY r.id, r.variant, r.status
        )
        SELECT GROUPING(variant) = 1 AS overall, variant AS key,
          count(*) FILTER (WHERE status = 'sent')::int AS sent,
          count(*) FILTER (WHERE human_open)::int AS unique_opens,
          count(*) FILTER (WHERE mpp_open AND NOT COALESCE(human_open, false))::int AS apple_mpp_only,
          count(*) FILTER (WHERE human_click)::int AS unique_clicks,
          COALESCE(sum(machine), 0)::int AS machine_events
        FROM per GROUP BY GROUPING SETS ((variant), ())
        ORDER BY overall DESC, variant NULLS FIRST`;
    },

    /** Unique human clicks per link. */
    async linkClicks(workspaceId: string, mailingId: string): Promise<Array<{ url: string; unique_clicks: number }>> {
      return db<Array<{ url: string; unique_clicks: number }>>`
        SELECT l.url, count(DISTINCT e.recipient_id) FILTER (WHERE NOT e.is_machine)::int AS unique_clicks
        FROM mailing_links l
        LEFT JOIN tracking_events e ON e.workspace_id = ${workspaceId} AND e.mailing_id = l.mailing_id
          AND e.kind = 'click' AND e.link_idx = l.idx
        WHERE l.workspace_id = ${workspaceId} AND l.mailing_id = ${mailingId}
        GROUP BY l.idx, l.url ORDER BY l.idx`;
    },

    /**
     * Unsubscribes, bounces and complaints this mailing caused: unsubscribes from
     * the `contact.unsubscribed` events that name it, bounces and complaints from
     * the suppressions whose source message belongs to it.
     */
    async outcomes(workspaceId: string, mailingId: string): Promise<{ unsubscribes: number; bounces: number; complaints: number }> {
      const [u] = await db<{ n: number }[]>`
        SELECT count(DISTINCT payload -> 'data' ->> 'email')::int AS n FROM webhook_events
        WHERE workspace_id = ${workspaceId} AND type = 'contact.unsubscribed' AND payload -> 'data' ->> 'mailing_id' = ${mailingId}`;
      const [s] = await db<{ bounces: number; complaints: number }[]>`
        SELECT count(*) FILTER (WHERE s.reason = 'bounced')::int AS bounces,
               count(*) FILTER (WHERE s.reason = 'complained')::int AS complaints
        FROM suppressions s JOIN messages m ON m.id = s.source_message_id AND m.workspace_id = s.workspace_id
        WHERE s.workspace_id = ${workspaceId} AND m.mailing_id = ${mailingId}`;
      return { unsubscribes: u!.n, bounces: s!.bounces, complaints: s!.complaints };
    },
  };
}

export function workspaceTrackingRepo(db: Db) {
  return {
    /** The workspace's settings; both off when never set. */
    async get(workspaceId: string): Promise<TrackingSettings> {
      const rows = await db<TrackingSettings[]>`
        SELECT opens, clicks FROM workspace_tracking WHERE workspace_id = ${workspaceId}`;
      return rows[0] ?? { opens: false, clicks: false };
    },

    async set(workspaceId: string, settings: TrackingSettings): Promise<void> {
      await db`
        INSERT INTO workspace_tracking (workspace_id, opens, clicks) VALUES (${workspaceId}, ${settings.opens}, ${settings.clicks})
        ON CONFLICT (workspace_id) DO UPDATE SET opens = EXCLUDED.opens, clicks = EXCLUDED.clicks, updated_at = now()`;
    },

    /**
     * What is actually tracked now: the setting, and only while the workspace's
     * master switch `settings.tracking_enabled` is on.
     */
    async effective(workspaceId: string): Promise<TrackingSettings> {
      const rows = await db<{ master: boolean | null; opens: boolean | null; clicks: boolean | null }[]>`
        SELECT (w.settings ->> 'tracking_enabled')::boolean AS master, t.opens, t.clicks
        FROM workspaces w LEFT JOIN workspace_tracking t ON t.workspace_id = w.id
        WHERE w.id = ${workspaceId}`;
      const row = rows[0];
      const on = row?.master === true;
      return { opens: on && row?.opens === true, clicks: on && row?.clicks === true };
    },
  };
}
