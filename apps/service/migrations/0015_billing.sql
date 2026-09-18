-- S5, billing: the plan and Stripe subscription mirrored per workspace, the
-- ledger of processed Stripe events, and an index for metering the send
-- ledger per workspace.
--
-- Stripe is the source of truth for what a workspace pays; this table is its
-- mirror, written only by the webhook and the reconciliation that re-reads a
-- subscription from Stripe. `billing_exempt` (a design partner outside
-- billing, plan design_partner) is written only by the operator command
-- `main.js billing-exempt`, never by an API route. Additive only.

CREATE TABLE workspace_billing (
  workspace_id            uuid PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
  plan                    text NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'starter', 'growth', 'design_partner')),
  status                  text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'trialing', 'past_due', 'cancelled')),
  billing_exempt          boolean NOT NULL DEFAULT false,
  exempt_reason           text CHECK (length(exempt_reason) <= 500),
  stripe_customer_id      text UNIQUE CHECK (stripe_customer_id ~ '^cus_[A-Za-z0-9]+$'),
  stripe_subscription_id  text UNIQUE CHECK (stripe_subscription_id ~ '^sub_[A-Za-z0-9]+$'),
  stripe_price_id         text,
  current_period_start    timestamptz,
  current_period_end      timestamptz,
  cancel_at_period_end    boolean NOT NULL DEFAULT false,
  -- When the mirror last matched Stripe (a webhook or a reconciliation read).
  stripe_synced_at        timestamptz,
  updated_at              timestamptz NOT NULL DEFAULT now(),
  -- The design-partner plan exists only as the exemption, and the exemption
  -- always means that plan: neither can be set without the other.
  CHECK (billing_exempt = (plan = 'design_partner')),
  -- A paid plan always has the subscription it is paid by.
  CHECK (plan NOT IN ('starter', 'growth') OR stripe_subscription_id IS NOT NULL),
  CHECK ((current_period_start IS NULL) = (current_period_end IS NULL)),
  CHECK (current_period_start IS NULL OR current_period_end > current_period_start)
);

-- Every workspace has exactly one billing row, from its first moment: existing
-- workspaces are backfilled, new ones get theirs from the trigger, so no code
-- path can meet a workspace without one.
INSERT INTO workspace_billing (workspace_id) SELECT id FROM workspaces;

CREATE FUNCTION workspace_billing_on_create() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO workspace_billing (workspace_id) VALUES (NEW.id) ON CONFLICT DO NOTHING;
  RETURN NEW;
END $$;

CREATE TRIGGER workspace_billing_on_create AFTER INSERT ON workspaces
  FOR EACH ROW EXECUTE FUNCTION workspace_billing_on_create();

-- One row per Stripe event this service acted on. The insert happens in the
-- same transaction as the change the event causes, so an event is applied
-- exactly once: a replay finds its row and changes nothing, and a failure
-- rolls both back so Stripe's retry runs it again. Events of another product
-- on the shared Stripe account are never recorded.
CREATE TABLE stripe_events (
  id                 text PRIMARY KEY CHECK (id ~ '^evt_[A-Za-z0-9]+$'),
  type               text NOT NULL,
  stripe_created_at  timestamptz NOT NULL,
  workspace_id       uuid REFERENCES workspaces(id) ON DELETE SET NULL,
  outcome            text NOT NULL CHECK (outcome IN ('applied', 'unchanged', 'unknown_workspace')),
  received_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX stripe_events_workspace_idx ON stripe_events (workspace_id, received_at DESC);

-- Monthly metering sums the send ledger per workspace; 0003's index is per provider.
CREATE INDEX provider_sends_workspace_idx ON provider_sends (workspace_id, created_at);
