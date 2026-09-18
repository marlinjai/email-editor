import type { PlanId, Subscription } from '@marlinjai/mail-contract';
import type { Db } from '../db.js';

/** A workspace's plan and the Stripe subscription it mirrors (migration 0015). */
export type BillingRow = {
  workspace_id: string;
  plan: PlanId;
  status: Subscription['status'];
  billing_exempt: boolean;
  exempt_reason: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  stripe_price_id: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  stripe_synced_at: string | null;
  updated_at: string;
};

/** What a subscription read from Stripe sets on the mirror. */
export type BillingMirror = {
  plan: 'free' | 'starter' | 'growth';
  status: Subscription['status'];
  stripeSubscriptionId: string | null;
  stripePriceId: string | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
};

const COLUMNS = `workspace_id, plan, status, billing_exempt, exempt_reason, stripe_customer_id, stripe_subscription_id,
  stripe_price_id, current_period_start, current_period_end, cancel_at_period_end, stripe_synced_at, updated_at`;

export function billingRepo(db: Db) {
  return {
    async get(workspaceId: string): Promise<BillingRow | null> {
      const rows = await db<BillingRow[]>`SELECT ${db.unsafe(COLUMNS)} FROM workspace_billing WHERE workspace_id = ${workspaceId}`;
      return rows[0] ?? null;
    },

    /**
     * Locks the workspace's billing row for the rest of the transaction. Every
     * limit check takes it first, so two requests of one workspace cannot both
     * pass a check that only one of them fits.
     */
    async lock(workspaceId: string): Promise<BillingRow | null> {
      const rows = await db<BillingRow[]>`
        SELECT ${db.unsafe(COLUMNS)} FROM workspace_billing WHERE workspace_id = ${workspaceId} FOR UPDATE`;
      return rows[0] ?? null;
    },

    /** Records the workspace's Stripe customer once; returns the one stored (an earlier one wins). */
    async setCustomer(workspaceId: string, customerId: string): Promise<string> {
      const rows = await db<{ stripe_customer_id: string }[]>`
        UPDATE workspace_billing SET stripe_customer_id = COALESCE(stripe_customer_id, ${customerId}), updated_at = now()
        WHERE workspace_id = ${workspaceId}
        RETURNING stripe_customer_id`;
      return rows[0]!.stripe_customer_id;
    },

    /** Stripe was read and had nothing to change. */
    async markSynced(workspaceId: string): Promise<void> {
      await db`UPDATE workspace_billing SET stripe_synced_at = now() WHERE workspace_id = ${workspaceId}`;
    },

    /**
     * Writes what Stripe says about the workspace's subscription. An exempt
     * workspace keeps its plan: the exemption is an operator decision a stray
     * Stripe event must not undo. Returns whether anything changed.
     */
    async mirror(workspaceId: string, m: BillingMirror): Promise<{ changed: boolean; row: BillingRow | null }> {
      const before = await this.lock(workspaceId);
      if (!before) return { changed: false, row: null };
      const rows = await db<BillingRow[]>`
        UPDATE workspace_billing SET
          plan = CASE WHEN billing_exempt THEN plan ELSE ${m.plan} END,
          status = CASE WHEN billing_exempt THEN status ELSE ${m.status} END,
          stripe_subscription_id = ${m.stripeSubscriptionId},
          stripe_price_id = ${m.stripePriceId},
          current_period_start = ${m.currentPeriodStart},
          current_period_end = ${m.currentPeriodEnd},
          cancel_at_period_end = ${m.cancelAtPeriodEnd},
          stripe_synced_at = now(),
          updated_at = now()
        WHERE workspace_id = ${workspaceId}
        RETURNING ${db.unsafe(COLUMNS)}`;
      const after = rows[0]!;
      const changed =
        before.plan !== after.plan ||
        before.status !== after.status ||
        before.stripe_subscription_id !== after.stripe_subscription_id ||
        before.stripe_price_id !== after.stripe_price_id ||
        before.current_period_start !== after.current_period_start ||
        before.current_period_end !== after.current_period_end ||
        before.cancel_at_period_end !== after.cancel_at_period_end;
      return { changed, row: after };
    },

    /**
     * Only the operator command calls this (src/billing/exempt.ts); no route
     * does. Lifting an exemption drops to `free`; the command then re-reads any
     * subscription from Stripe, which restores a paid plan.
     */
    async setExempt(workspaceId: string, exempt: boolean, reason: string | null): Promise<BillingRow | null> {
      const rows = await db<BillingRow[]>`
        UPDATE workspace_billing SET
          billing_exempt = ${exempt},
          exempt_reason = ${exempt ? reason : null},
          plan = ${exempt ? 'design_partner' : 'free'},
          status = 'active',
          stripe_synced_at = NULL,
          updated_at = now()
        WHERE workspace_id = ${workspaceId}
        RETURNING ${db.unsafe(COLUMNS)}`;
      return rows[0] ?? null;
    },

    /**
     * The workspace a Stripe customer or subscription belongs to, for the
     * webhook, which knows only Stripe's ids. Returns the id alone, for the
     * scoped calls that follow.
     */
    async workspaceForStripeForWebhook(ids: { customerId?: string | null; subscriptionId?: string | null }): Promise<string | null> {
      if (ids.subscriptionId) {
        const rows = await db<{ workspace_id: string }[]>`
          SELECT workspace_id FROM workspace_billing WHERE stripe_subscription_id = ${ids.subscriptionId}`;
        if (rows[0]) return rows[0].workspace_id;
      }
      if (ids.customerId) {
        const rows = await db<{ workspace_id: string }[]>`
          SELECT workspace_id FROM workspace_billing WHERE stripe_customer_id = ${ids.customerId}`;
        if (rows[0]) return rows[0].workspace_id;
      }
      return null;
    },

    /** For the operator's `billing-exempt` command, which may name a workspace by slug. */
    async workspaceIdForSlugForOperator(slug: string): Promise<string | null> {
      const rows = await db<{ id: string }[]>`SELECT id FROM workspaces WHERE slug = ${slug}`;
      return rows[0]?.id ?? null;
    },

    /** Workspaces with a Stripe customer whose mirror is older than `staleBefore`, for reconciliation. */
    async listStaleForWorker(staleBefore: Date, limit: number): Promise<Array<{ workspace_id: string }>> {
      return db<Array<{ workspace_id: string }>>`
        SELECT workspace_id FROM workspace_billing
        WHERE stripe_customer_id IS NOT NULL AND NOT billing_exempt
          AND (stripe_synced_at IS NULL OR stripe_synced_at < ${staleBefore.toISOString()})
        ORDER BY stripe_synced_at NULLS FIRST
        LIMIT ${limit}`;
    },

    /** Recipients handed to a provider in [from, to), tests included: the `messages` metric. */
    async messagesBetween(workspaceId: string, from: string, to: string): Promise<number> {
      const rows = await db<{ n: string }[]>`
        SELECT COALESCE(sum(recipients), 0) AS n FROM provider_sends
        WHERE workspace_id = ${workspaceId} AND created_at >= ${from} AND created_at < ${to}`;
      return Number(rows[0]!.n);
    },

    /**
     * Recipients still waiting in mailings that already started (sending or
     * paused): committed spend the send ledger does not hold yet.
     */
    async pendingRecipients(workspaceId: string): Promise<number> {
      const rows = await db<{ n: string }[]>`
        SELECT count(*) AS n FROM mailing_recipients r
        JOIN mailings m ON m.workspace_id = r.workspace_id AND m.id = r.mailing_id
        WHERE r.workspace_id = ${workspaceId} AND m.status IN ('sending', 'paused') AND r.status IN ('queued', 'sending')`;
      return Number(rows[0]!.n);
    },

    async counts(workspaceId: string): Promise<{ contacts: number; members: number; providers: number; webhook_endpoints: number }> {
      const rows = await db<{ contacts: string; members: string; providers: string; webhook_endpoints: string }[]>`
        SELECT
          (SELECT count(*) FROM contacts WHERE workspace_id = ${workspaceId}) AS contacts,
          (SELECT count(*) FROM workspace_members WHERE workspace_id = ${workspaceId}) AS members,
          (SELECT count(*) FROM providers WHERE workspace_id = ${workspaceId} AND deleted_at IS NULL) AS providers,
          (SELECT count(*) FROM webhook_endpoints WHERE workspace_id = ${workspaceId}) AS webhook_endpoints`;
      const r = rows[0]!;
      return {
        contacts: Number(r.contacts),
        members: Number(r.members),
        providers: Number(r.providers),
        webhook_endpoints: Number(r.webhook_endpoints),
      };
    },
  };
}

export type StripeEventOutcome = 'applied' | 'unchanged' | 'unknown_workspace';

/** The processed-events ledger that makes each Stripe event apply exactly once. */
export function stripeEventsRepo(db: Db) {
  return {
    /**
     * Claims the event inside the caller's transaction. False means it was
     * already processed: a replay, to be acknowledged without doing anything.
     */
    async claim(event: { id: string; type: string; created: number }): Promise<boolean> {
      const rows = await db`
        INSERT INTO stripe_events (id, type, stripe_created_at, outcome)
        VALUES (${event.id}, ${event.type}, ${new Date(event.created * 1000).toISOString()}, 'unchanged')
        ON CONFLICT (id) DO NOTHING
        RETURNING id`;
      return rows.length > 0;
    },

    async exists(eventId: string): Promise<boolean> {
      const rows = await db`SELECT 1 FROM stripe_events WHERE id = ${eventId}`;
      return rows.length > 0;
    },

    async settle(eventId: string, workspaceId: string | null, outcome: StripeEventOutcome): Promise<void> {
      await db`UPDATE stripe_events SET workspace_id = ${workspaceId}, outcome = ${outcome} WHERE id = ${eventId}`;
    },

    async listForWorkspace(workspaceId: string): Promise<Array<{ id: string; type: string; outcome: StripeEventOutcome }>> {
      return db<Array<{ id: string; type: string; outcome: StripeEventOutcome }>>`
        SELECT id, type, outcome FROM stripe_events WHERE workspace_id = ${workspaceId} ORDER BY received_at, id`;
    },
  };
}
