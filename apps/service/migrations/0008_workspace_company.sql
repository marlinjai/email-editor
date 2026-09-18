-- S3: key each workspace to the auth-brain company (tenant) that created it, and
-- keep a ledger of the company erasures auth-brain has sent.
--
-- The dashboard creates a workspace for the signed-in person's active company,
-- so auth-brain's `tenant.erased` webhook can find every workspace of an erased
-- company (POST /internal/erasure, src/routes/erasure.ts). The column is
-- nullable: workspaces created before S3 (or by a future path with no company)
-- carry none, and an erasure never touches them. Additive only.

ALTER TABLE workspaces
  ADD COLUMN company_id text CHECK (company_id IS NULL OR length(company_id) BETWEEN 1 AND 64);
CREATE INDEX workspaces_company_idx ON workspaces (company_id) WHERE company_id IS NOT NULL;

-- One row per erasure event handled, so a redelivery of the same event id is a
-- no-op success (auth-brain retries until it sees a 2xx). Ids only: the event
-- carries no personal data and neither does this table.
CREATE TABLE erasure_events (
  event_id           text PRIMARY KEY CHECK (length(event_id) BETWEEN 1 AND 128),
  kind               text NOT NULL,
  tenant_id          text,
  workspaces_erased  integer NOT NULL CHECK (workspaces_erased >= 0),
  processed_at       timestamptz NOT NULL DEFAULT now()
);
