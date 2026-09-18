-- S4, the platform features, part 3: hosted signup forms with double opt-in.
--
-- Conventions as in 0003. Independent of 0008, 0009, 0011 and 0013.

-- A form. topics and tags are slugs (topic slugs never change; a tag deleted
-- later is skipped at confirmation). Deleting is soft (deleted_at): consent
-- records name the form and its version, and a pending confirmation of a deleted
-- form must be recognisable as such. confirmation_html is the confirmation
-- template compiled when the form was saved, so a later template edit does not
-- change what a saved form sends.
CREATE TABLE signup_forms (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id              uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name                      text NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  title                     text NOT NULL CHECK (length(title) BETWEEN 1 AND 120),
  consent_text              text NOT NULL CHECK (length(consent_text) BETWEEN 1 AND 2000),
  translations              jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(translations) = 'object'),
  topics                    text[] NOT NULL CHECK (cardinality(topics) >= 1),
  tags                      text[] NOT NULL DEFAULT '{}',
  fields                    text[] NOT NULL DEFAULT '{}' CHECK (fields <@ ARRAY['first_name', 'last_name']::text[]),
  provider_id               uuid NOT NULL,
  confirmation_template_id  uuid,
  confirmation_html         text,
  redirect_url              text CHECK (redirect_url ~ '^https?://' AND length(redirect_url) <= 2048),
  allowed_origins           text[] NOT NULL DEFAULT '{}' CHECK (cardinality(allowed_origins) <= 20),
  version                   integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  deleted_at                timestamptz,
  created_at                timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at                timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, id),
  CHECK ((confirmation_template_id IS NULL) = (confirmation_html IS NULL)),
  FOREIGN KEY (workspace_id, provider_id) REFERENCES providers (workspace_id, id) ON DELETE RESTRICT
);
CREATE INDEX signup_forms_workspace_idx ON signup_forms (workspace_id, created_at, id) WHERE deleted_at IS NULL;

-- A submission waiting for its double opt-in, and the outbox of its
-- confirmation mail. Nothing about the person reaches contacts before the link
-- is followed. The address the request came from is kept only as a keyed hash
-- (src/platform/tokens.ts). A later submission of the same address to the same
-- form supersedes this one (superseded_at), so only the newest link works.
CREATE TABLE signup_submissions (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id          uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  form_id               uuid NOT NULL,
  form_version          integer NOT NULL CHECK (form_version >= 1),
  email                 text NOT NULL CHECK (email = lower(email) AND length(email) BETWEEN 3 AND 254),
  first_name            text CHECK (length(first_name) <= 200),
  last_name             text CHECK (length(last_name) <= 200),
  locale                text NOT NULL CHECK (length(locale) BETWEEN 2 AND 35),
  -- What the person was shown and agreed to, in the language they saw.
  consent_text          text NOT NULL CHECK (length(consent_text) BETWEEN 1 AND 4000),
  submitted_ip_hash     text,
  created_at            timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at            timestamptz NOT NULL,
  superseded_at         timestamptz,
  confirmed_at          timestamptz,
  confirmed_ip_hash     text,
  contact_id            uuid,
  -- The confirmation mail: pending (due at mail_next_attempt_at), sending (handed
  -- to a worker, claimed at mail_claimed_at), sent, failed (with the reason), or
  -- skipped (superseded or confirmed before it went out).
  mail_status           text NOT NULL DEFAULT 'pending'
                        CHECK (mail_status IN ('pending', 'sending', 'sent', 'failed', 'skipped')),
  mail_attempts         integer NOT NULL DEFAULT 0 CHECK (mail_attempts >= 0),
  mail_next_attempt_at  timestamptz NOT NULL DEFAULT now(),
  mail_claimed_at       timestamptz,
  mail_last_error       text,
  message_id            uuid,
  UNIQUE (workspace_id, id),
  CHECK (mail_status <> 'sending' OR mail_claimed_at IS NOT NULL),
  CHECK (mail_status <> 'failed' OR mail_last_error IS NOT NULL),
  CHECK (confirmed_at IS NULL OR superseded_at IS NULL),
  FOREIGN KEY (workspace_id, form_id) REFERENCES signup_forms (workspace_id, id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id, contact_id) REFERENCES contacts (workspace_id, id) ON DELETE SET NULL (contact_id),
  FOREIGN KEY (workspace_id, message_id) REFERENCES messages (workspace_id, id) ON DELETE SET NULL (message_id)
);
-- "Is there an earlier open submission of this address to this form?"
CREATE INDEX signup_submissions_open_idx ON signup_submissions (form_id, email)
  WHERE confirmed_at IS NULL AND superseded_at IS NULL;
-- The confirmation-mail outbox, across workspaces.
CREATE INDEX signup_submissions_outbox_idx ON signup_submissions (mail_next_attempt_at, id) WHERE mail_status = 'pending';
CREATE INDEX signup_submissions_inflight_idx ON signup_submissions (mail_claimed_at) WHERE mail_status = 'sending';
-- The purge of old rows.
CREATE INDEX signup_submissions_created_idx ON signup_submissions (created_at);

-- Fixed-window counters for the rate limits of the public signup endpoints, in
-- Postgres so they hold across restarts and instances. scope is 'ip' (key_hash:
-- the keyed hash of the client address) or 'workspace' (key_hash: empty).
CREATE TABLE signup_rate_limits (
  workspace_id  uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  scope         text NOT NULL CHECK (scope IN ('ip', 'workspace')),
  key_hash      text NOT NULL,
  window_start  timestamptz NOT NULL,
  count         integer NOT NULL CHECK (count >= 0),
  PRIMARY KEY (workspace_id, scope, key_hash, window_start)
);
CREATE INDEX signup_rate_limits_window_idx ON signup_rate_limits (window_start);
