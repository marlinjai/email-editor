-- F4: webhook secret rotation window, and delivery diagnostics.
--
-- 0003 gave every endpoint exactly one secret. During a rotation the contract
-- allows a request to carry several comma-separated v1= signatures
-- (packages/mail-contract/src/webhook-signing.ts), so the delivery loop needs
-- to keep signing with the outgoing secret for a documented window after a
-- rotation, until every receiver has picked up the new one. Additive only.

ALTER TABLE webhook_endpoints
  ADD COLUMN previous_secret_sealed text
    CHECK (previous_secret_sealed IS NULL OR previous_secret_sealed ~ '^sealed:v[0-9]+:'),
  ADD COLUMN previous_secret_expires_at timestamptz;

-- What the delivery loop recorded about the last attempt, for operators
-- diagnosing a failing endpoint. Not returned by the API; SQL only.
ALTER TABLE webhook_deliveries
  ADD COLUMN last_response_snippet text,
  ADD COLUMN last_duration_ms integer CHECK (last_duration_ms IS NULL OR last_duration_ms >= 0);
