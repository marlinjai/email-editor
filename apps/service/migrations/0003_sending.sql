-- S2, sending: providers, topics, contacts and their topic subscriptions,
-- suppressions, mailings and their recipients, the sent archive, the provider
-- send ledger behind the daily budget, webhook endpoints and deliveries, and the
-- event outbox.
--
-- Conventions, the same as 0001:
-- - Every table carries workspace_id and is read and written only through a
--   repository function that takes that id first (src/repo/*.ts).
-- - A reference to another workspace-owned row is a composite foreign key on
--   (workspace_id, <id>), so a row can never point into another workspace, even
--   through a bug in a route. Each referenced table has UNIQUE (workspace_id, id)
--   for that purpose.
-- - CHECK constraints mirror the enums of @marlinjai/mail-contract.
-- - Secrets are stored sealed (src/sealing.ts, AES-256-GCM under
--   MAIL_SECRETS_KEY); a CHECK refuses anything that does not look sealed, so a
--   plaintext credential cannot be written even by mistake.
--
-- Independent of 0002 (templates and assets), which another branch adds:
-- mailings.template_id is provenance only and deliberately carries no foreign key,
-- so this file applies whether or not 0002 exists yet, and deleting a template
-- never rewrites the history of a mailing sent from it. The runner applies any
-- file not yet recorded, in name order, so a database that got 0003 first takes
-- 0002 on the next migrate (test/integration/migrations.test.ts proves it).

-- Providers: one sending account (SMTP or Resend) and the limits the worker
-- enforces for it. config holds only non-secret settings (host, port, security,
-- username); the password or API key lives sealed in secret_sealed. Deleting a
-- provider is soft (deleted_at), because mailings and archived messages keep
-- pointing at it.
CREATE TABLE providers (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id                uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  kind                        text NOT NULL CHECK (kind IN ('smtp', 'resend')),
  name                        text NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  config                      jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(config) = 'object'),
  secret_sealed               text CHECK (secret_sealed ~ '^sealed:v[0-9]+:'),
  from_name                   text NOT NULL CHECK (length(from_name) BETWEEN 1 AND 120),
  from_email                  text NOT NULL CHECK (from_email = lower(from_email)),
  reply_to                    text CHECK (reply_to = lower(reply_to)),
  daily_recipient_budget      integer NOT NULL CHECK (daily_recipient_budget BETWEEN 1 AND 10000000),
  min_interval_ms             integer NOT NULL CHECK (min_interval_ms BETWEEN 0 AND 3600000),
  max_recipients_per_message  integer NOT NULL CHECK (max_recipients_per_message BETWEEN 1 AND 1000),
  deleted_at                  timestamptz,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, id)
);
CREATE INDEX providers_workspace_idx ON providers (workspace_id, created_at, id) WHERE deleted_at IS NULL;

-- Preference topics: every mailing is sent under exactly one.
CREATE TABLE topics (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  slug          text NOT NULL CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND length(slug) <= 64),
  name          text NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  description   text CHECK (length(description) <= 1000),
  translations  jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(translations) = 'object'),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, id),
  UNIQUE (workspace_id, slug)
);

-- Contacts: the client's people, copied minimally. Found by external_id (unique
-- per workspace when set; NULLs never collide under a plain UNIQUE) or by email
-- (stored lowercased, unique per workspace).
CREATE TABLE contacts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  external_id   text CHECK (length(external_id) BETWEEN 1 AND 255),
  email         text NOT NULL CHECK (email = lower(email) AND length(email) BETWEEN 3 AND 254),
  first_name    text CHECK (length(first_name) <= 200),
  last_name     text CHECK (length(last_name) <= 200),
  locale        text CHECK (length(locale) BETWEEN 2 AND 35),
  properties    jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(properties) = 'object'),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, id),
  UNIQUE (workspace_id, email),
  UNIQUE (workspace_id, external_id)
);
CREATE INDEX contacts_workspace_idx ON contacts (workspace_id, created_at, id);

CREATE TABLE contact_topic_subscriptions (
  workspace_id  uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  contact_id    uuid NOT NULL,
  topic_id      uuid NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (contact_id, topic_id),
  FOREIGN KEY (workspace_id, contact_id) REFERENCES contacts (workspace_id, id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id, topic_id) REFERENCES topics (workspace_id, id) ON DELETE CASCADE
);
CREATE INDEX contact_topic_subscriptions_topic_idx ON contact_topic_subscriptions (workspace_id, topic_id, contact_id);

-- Mailings: one broadcast. document is the snapshot that is sent; mjml and html
-- are compiled from it when sending starts. Recipient counts are not stored:
-- they are computed from mailing_recipients (index below), so they can never
-- drift from the rows they count.
CREATE TABLE mailings (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name          text CHECK (length(name) <= 200),
  subject       text NOT NULL CHECK (length(subject) BETWEEN 1 AND 998),
  preheader     text CHECK (length(preheader) <= 500),
  template_id   uuid,
  document      jsonb NOT NULL CHECK (jsonb_typeof(document) = 'object'),
  mjml          text,
  html          text,
  topic_id      uuid NOT NULL,
  provider_id   uuid NOT NULL,
  status        text NOT NULL DEFAULT 'draft'
                CHECK (status IN ('draft', 'scheduled', 'sending', 'paused', 'sent', 'partially_failed', 'cancelled')),
  metadata      jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_by    jsonb NOT NULL,
  scheduled_at  timestamptz,
  started_at    timestamptz,
  finished_at   timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, id),
  FOREIGN KEY (workspace_id, topic_id) REFERENCES topics (workspace_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id, provider_id) REFERENCES providers (workspace_id, id) ON DELETE RESTRICT
);
CREATE INDEX mailings_workspace_idx ON mailings (workspace_id, created_at DESC, id DESC);
-- The worker's scan for mailings to work on, across workspaces.
CREATE INDEX mailings_sending_idx ON mailings (updated_at, id) WHERE status = 'sending';

-- The archive: one row per message handed to a provider (or refused by it),
-- tests included. recipient_count is the To plus CC plus BCC of the message.
-- contact_id and recipient_id survive erasure as NULL; erasure itself deletes
-- the rows (and so the HTML) sent to the erased person.
CREATE TABLE messages (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id         uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  mailing_id           uuid,
  recipient_id         uuid,
  contact_id           uuid,
  to_email             text NOT NULL CHECK (to_email = lower(to_email)),
  subject              text NOT NULL,
  html                 text NOT NULL,
  provider_id          uuid NOT NULL,
  provider_message_id  text,
  outcome              text NOT NULL CHECK (outcome IN ('sent', 'failed')),
  error                text,
  is_test              boolean NOT NULL DEFAULT false,
  recipient_count      integer NOT NULL DEFAULT 1 CHECK (recipient_count >= 1),
  created_at           timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (workspace_id, id),
  CHECK ((outcome = 'failed') = (error IS NOT NULL)),
  FOREIGN KEY (workspace_id, mailing_id) REFERENCES mailings (workspace_id, id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id, contact_id) REFERENCES contacts (workspace_id, id) ON DELETE SET NULL (contact_id),
  FOREIGN KEY (workspace_id, provider_id) REFERENCES providers (workspace_id, id) ON DELETE RESTRICT
);
CREATE INDEX messages_workspace_idx ON messages (workspace_id, created_at DESC, id DESC);
CREATE INDEX messages_mailing_idx ON messages (workspace_id, mailing_id, created_at DESC, id DESC) WHERE mailing_id IS NOT NULL;
CREATE INDEX messages_contact_idx ON messages (workspace_id, contact_id, created_at DESC, id DESC) WHERE contact_id IS NOT NULL;
-- Crash reconciliation: "is there a message for this recipient?"
CREATE INDEX messages_recipient_idx ON messages (recipient_id) WHERE recipient_id IS NOT NULL;

-- Recipients of a mailing: the send queue. Idempotent on the address within a
-- mailing. A skipped row always says why; nothing else carries a skip reason.
CREATE TABLE mailing_recipients (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id     uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  mailing_id       uuid NOT NULL,
  contact_id       uuid,
  email            text NOT NULL CHECK (email = lower(email)),
  merge            jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(merge) = 'object'),
  status           text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'sending', 'sent', 'failed', 'skipped')),
  skip_reason      text CHECK (skip_reason IN ('suppressed', 'not_subscribed', 'contact_erased', 'cancelled', 'outcome_unknown')),
  attempts         integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  -- A transient failure waits until then before the worker claims it again.
  next_attempt_at  timestamptz NOT NULL DEFAULT now(),
  -- When the worker moved it to 'sending'; a row still 'sending' long after is a
  -- crash to reconcile.
  claimed_at       timestamptz,
  message_id       uuid,
  last_error       text,
  created_at       timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, id),
  UNIQUE (mailing_id, email),
  CHECK ((status = 'skipped') = (skip_reason IS NOT NULL)),
  CHECK (status <> 'sending' OR claimed_at IS NOT NULL),
  FOREIGN KEY (workspace_id, mailing_id) REFERENCES mailings (workspace_id, id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id, contact_id) REFERENCES contacts (workspace_id, id) ON DELETE SET NULL (contact_id),
  FOREIGN KEY (workspace_id, message_id) REFERENCES messages (workspace_id, id) ON DELETE SET NULL (message_id)
);
-- The claim query: the next queued recipient of a mailing that is due.
CREATE INDEX mailing_recipients_claim_idx ON mailing_recipients (mailing_id, next_attempt_at, created_at, id) WHERE status = 'queued';
-- Crash reconciliation: rows left 'sending'.
CREATE INDEX mailing_recipients_inflight_idx ON mailing_recipients (claimed_at) WHERE status = 'sending';
-- Live counts per status, and listing a mailing's recipients.
CREATE INDEX mailing_recipients_status_idx ON mailing_recipients (mailing_id, status);
CREATE INDEX mailing_recipients_list_idx ON mailing_recipients (workspace_id, mailing_id, created_at, id);
CREATE INDEX mailing_recipients_contact_idx ON mailing_recipients (workspace_id, contact_id) WHERE contact_id IS NOT NULL;

-- messages.recipient_id points back at the queue row; declared here because the
-- two tables reference each other.
ALTER TABLE messages
  ADD FOREIGN KEY (workspace_id, recipient_id) REFERENCES mailing_recipients (workspace_id, id) ON DELETE SET NULL (recipient_id);

-- Suppressions: blocks on an address, independent of contacts (deleting a
-- contact never lifts one). topic_id NULL means every topic. NULLS NOT DISTINCT
-- makes (email, NULL) unique too: one all-topics block per address, and at most
-- one block per address and topic besides it.
CREATE TABLE suppressions (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id       uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  email              text NOT NULL CHECK (email = lower(email)),
  reason             text NOT NULL CHECK (reason IN ('unsubscribed', 'bounced', 'complained', 'manual')),
  topic_id           uuid,
  source_message_id  uuid,
  note               text CHECK (length(note) <= 1000),
  created_at         timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (workspace_id, id),
  CONSTRAINT suppressions_unique_block UNIQUE NULLS NOT DISTINCT (workspace_id, email, topic_id),
  FOREIGN KEY (workspace_id, topic_id) REFERENCES topics (workspace_id, id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id, source_message_id) REFERENCES messages (workspace_id, id) ON DELETE SET NULL (source_message_id)
);
CREATE INDEX suppressions_workspace_idx ON suppressions (workspace_id, created_at DESC, id DESC);

-- The ledger behind the rolling 24-hour recipient budget: one row per message
-- handed to a provider, tests and transactional sends included. No foreign key to
-- messages: spend already made does not shrink when a contact is erased.
CREATE TABLE provider_sends (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  provider_id   uuid NOT NULL,
  recipients    integer NOT NULL CHECK (recipients >= 1),
  created_at    timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY (workspace_id, provider_id) REFERENCES providers (workspace_id, id) ON DELETE CASCADE
);
CREATE INDEX provider_sends_window_idx ON provider_sends (provider_id, created_at);

-- Webhook endpoints: where events go, signed with a per-endpoint secret stored
-- sealed (it has to be read back to sign, so it cannot be a hash).
CREATE TABLE webhook_endpoints (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id   uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  url            text NOT NULL CHECK (url ~ '^https?://' AND length(url) <= 2048),
  description    text CHECK (length(description) <= 500),
  events         text[] NOT NULL CHECK (
                   cardinality(events) >= 1
                   AND events <@ ARRAY['message.sent', 'message.failed', 'contact.unsubscribed', 'contact.bounced', 'mailing.finished']::text[]
                 ),
  enabled        boolean NOT NULL DEFAULT true,
  secret_sealed  text NOT NULL CHECK (secret_sealed ~ '^sealed:v[0-9]+:'),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, id)
);
CREATE INDEX webhook_endpoints_workspace_idx ON webhook_endpoints (workspace_id, created_at, id);

-- The event outbox. An event is written in the same transaction as the state
-- change it reports (src/events.ts, emitEvent), together with one pending
-- delivery per subscribed endpoint, so an event exists if and only if the change
-- committed. payload is the full contract envelope, exactly as it will be sent.
CREATE TABLE webhook_events (
  id            uuid PRIMARY KEY,
  workspace_id  uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  type          text NOT NULL
                CHECK (type IN ('message.sent', 'message.failed', 'contact.unsubscribed', 'contact.bounced', 'mailing.finished')),
  payload       jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  created_at    timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (workspace_id, id)
);
CREATE INDEX webhook_events_workspace_idx ON webhook_events (workspace_id, created_at DESC, id DESC);

-- One row per (endpoint, event). A redelivery resets the row; it never adds one.
CREATE TABLE webhook_deliveries (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id      uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  endpoint_id       uuid NOT NULL,
  event_id          uuid NOT NULL,
  event_type        text NOT NULL
                    CHECK (event_type IN ('message.sent', 'message.failed', 'contact.unsubscribed', 'contact.bounced', 'mailing.finished')),
  status            text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'succeeded', 'failed')),
  attempts          integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  last_status_code  integer CHECK (last_status_code BETWEEN 100 AND 599),
  last_error        text,
  next_attempt_at   timestamptz DEFAULT now(),
  delivered_at      timestamptz,
  created_at        timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (workspace_id, id),
  UNIQUE (endpoint_id, event_id),
  CHECK (status <> 'pending' OR next_attempt_at IS NOT NULL),
  CHECK ((status = 'succeeded') = (delivered_at IS NOT NULL)),
  FOREIGN KEY (workspace_id, endpoint_id) REFERENCES webhook_endpoints (workspace_id, id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id, event_id) REFERENCES webhook_events (workspace_id, id) ON DELETE CASCADE
);
-- The delivery loop's claim query, across workspaces.
CREATE INDEX webhook_deliveries_due_idx ON webhook_deliveries (next_attempt_at, id) WHERE status = 'pending';
CREATE INDEX webhook_deliveries_endpoint_idx ON webhook_deliveries (workspace_id, endpoint_id, created_at DESC, id DESC);
