-- Bounce and complaint handling.
--
-- 1. Rejections the provider's side is at fault for (policy, relay,
--    authentication, reputation: SMTP 5.7.x) never suppress a recipient; they are
--    counted on the provider so the dashboard can show that the sender has a
--    problem.
-- 2. A Resend provider receives Resend's events (email.bounced,
--    email.complained) at POST /providers/:id/events/resend, signed with the
--    endpoint's signing secret (sealed like the API key). `events_webhook_id` is
--    Resend's id of the endpoint the service registered itself, null when the
--    secret was pasted by hand or nothing is registered yet.
ALTER TABLE providers
  ADD COLUMN rejections_count        integer NOT NULL DEFAULT 0 CHECK (rejections_count >= 0),
  ADD COLUMN last_rejection          text CHECK (length(last_rejection) <= 1000),
  ADD COLUMN last_rejection_at       timestamptz,
  ADD COLUMN events_secret_sealed    text CHECK (events_secret_sealed ~ '^sealed:v[0-9]+:'),
  ADD COLUMN events_webhook_id       text CHECK (length(events_webhook_id) <= 200),
  ADD COLUMN events_source           text CHECK (events_source IN ('automatic', 'manual')),
  ADD COLUMN events_error            text CHECK (length(events_error) <= 1000),
  -- Resend events naming an email this provider never sent through the service: counted, never acted on.
  ADD COLUMN events_unmatched_count  integer NOT NULL DEFAULT 0 CHECK (events_unmatched_count >= 0),
  -- The last time the bounce circuit breaker tripped on a mailing of this provider.
  ADD COLUMN anomaly_at              timestamptz,
  ADD COLUMN anomaly_mailing_id      uuid,
  ADD COLUMN anomaly_reason          text CHECK (length(anomaly_reason) <= 1000),
  ADD COLUMN anomaly_sample          text CHECK (length(anomaly_sample) <= 1000),
  ADD CONSTRAINT providers_events_source_has_secret CHECK ((events_source IS NULL) = (events_secret_sealed IS NULL));

-- The bounce circuit breaker (src/worker/breaker.ts). A run of a mailing
-- starts whenever it enters `sending` (send, resume, retry-failed); only the
-- messages of the current run count. When too many recipients of one run are
-- rejected as dead addresses, the rejections are more likely the provider's or
-- the setup's fault than the list's: the breaker undoes the run's bounce
-- blocks and pauses the mailing with `pause_reason`.
ALTER TABLE mailings
  ADD COLUMN run_started_at     timestamptz,
  ADD COLUMN pause_reason       text CHECK (length(pause_reason) <= 1000),
  ADD COLUMN breaker_tripped_at timestamptz;

-- How the worker classified a permanent rejection, and the reply text with the
-- addresses stripped: what the breaker compares.
ALTER TABLE messages
  ADD COLUMN rejection_class     text CHECK (rejection_class IN ('recipient', 'sender', 'unknown')),
  ADD COLUMN rejection_signature text CHECK (length(rejection_signature) <= 1000);
CREATE INDEX messages_mailing_run_idx ON messages (workspace_id, mailing_id, created_at, id)
  WHERE mailing_id IS NOT NULL AND is_test = false;

-- A provider event names the message by the provider's id for it.
CREATE INDEX messages_provider_message_idx ON messages (workspace_id, provider_id, provider_message_id)
  WHERE provider_message_id IS NOT NULL;

-- Exactly once per provider event: its id (Svix's `svix-id` for Resend) is
-- claimed in the same transaction as the change it causes, so a retried or
-- replayed delivery changes nothing. No address is stored here: erasure has
-- nothing to find. Rows older than 30 days are pruned on ingest; Resend stops
-- retrying well before that.
CREATE TABLE provider_events (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id         uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  provider_id          uuid NOT NULL,
  external_id          text NOT NULL CHECK (length(external_id) BETWEEN 1 AND 200),
  type                 text NOT NULL CHECK (length(type) BETWEEN 1 AND 100),
  provider_message_id  text,
  outcome              text NOT NULL CHECK (outcome IN ('suppressed', 'already_suppressed', 'ignored', 'unmatched')),
  received_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider_id, external_id),
  FOREIGN KEY (workspace_id, provider_id) REFERENCES providers (workspace_id, id) ON DELETE CASCADE
);
CREATE INDEX provider_events_received_idx ON provider_events (provider_id, received_at);
