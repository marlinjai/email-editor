-- S4, the platform features, part 1: tags, typed contact properties, consent
-- records, segments, and the webhook event types S4 adds.
--
-- Conventions as in 0003: every table carries workspace_id, references to other
-- workspace-owned rows are composite foreign keys on (workspace_id, id), and
-- CHECK constraints mirror the enums of @marlinjai/mail-contract.
--
-- Independent of 0008 and 0009 (the dashboard's), so it applies whichever lands
-- first.

-- Tags: labels a workspace puts on its contacts.
CREATE TABLE tags (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  slug          text NOT NULL CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND length(slug) <= 64),
  name          text NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  created_at    timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (workspace_id, id),
  UNIQUE (workspace_id, slug)
);
CREATE INDEX tags_workspace_idx ON tags (workspace_id, created_at, id);

CREATE TABLE contact_tags (
  workspace_id  uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  contact_id    uuid NOT NULL,
  tag_id        uuid NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (contact_id, tag_id),
  FOREIGN KEY (workspace_id, contact_id) REFERENCES contacts (workspace_id, id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id, tag_id) REFERENCES tags (workspace_id, id) ON DELETE CASCADE
);
CREATE INDEX contact_tags_tag_idx ON contact_tags (workspace_id, tag_id, contact_id);

-- Typed custom properties: a definition makes every write of that key
-- type-checked. Values stay in contacts.properties.
CREATE TABLE contact_properties (
  workspace_id  uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  key           text NOT NULL CHECK (key ~ '^[A-Za-z0-9_.-]{1,64}$'),
  label         text NOT NULL CHECK (length(label) BETWEEN 1 AND 120),
  type          text NOT NULL CHECK (type IN ('string', 'number', 'boolean', 'date')),
  created_at    timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (workspace_id, key)
);

-- Consent records: why a contact is subscribed to a topic, for contacts the
-- service itself collected (CSV import, signup form). One row per topic per
-- event. import_id and signup_form_id are provenance only, without foreign keys
-- (as mailings.template_id): the record must outlive the import or the form.
-- Erasing the contact erases its records (Art. 17 GDPR, the General Data
-- Protection Regulation's right to erasure).
CREATE TABLE contact_consents (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id         uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  contact_id           uuid NOT NULL,
  topic_id             uuid,
  source               text NOT NULL CHECK (source IN ('import', 'signup_form')),
  import_id            uuid,
  signup_form_id       uuid,
  signup_form_version  integer CHECK (signup_form_version >= 1),
  -- What the person agreed to, exactly as shown (signup), or null (import).
  consent_text         text CHECK (length(consent_text) <= 4000),
  locale               text CHECK (length(locale) BETWEEN 2 AND 35),
  -- HMAC of the address the submission and the confirmation came from; never the address itself.
  submitted_ip_hash    text,
  confirmed_ip_hash    text,
  -- Who stated the consent for an import (the audit actor), null for a signup.
  stated_by            jsonb,
  submitted_at         timestamptz,
  confirmed_at         timestamptz NOT NULL,
  created_at           timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (workspace_id, id),
  CHECK ((source = 'import') = (import_id IS NOT NULL AND stated_by IS NOT NULL)),
  CHECK ((source = 'signup_form') = (signup_form_id IS NOT NULL AND consent_text IS NOT NULL)),
  FOREIGN KEY (workspace_id, contact_id) REFERENCES contacts (workspace_id, id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id, topic_id) REFERENCES topics (workspace_id, id) ON DELETE SET NULL (topic_id)
);
CREATE INDEX contact_consents_contact_idx ON contact_consents (workspace_id, contact_id, created_at);

-- Segments: saved filters. The filter is the contract's SegmentFilter AST; the
-- service compiles it to parameterised SQL on every use.
CREATE TABLE segments (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name          text NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  filter        jsonb NOT NULL CHECK (jsonb_typeof(filter) = 'object'),
  created_at    timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, id)
);
CREATE INDEX segments_workspace_idx ON segments (workspace_id, created_at, id);

-- The webhook event types S4 adds (WEBHOOK_EVENT_TYPES in the contract). The
-- constraints are replaced, as in 0006; every value allowed before stays allowed.
ALTER TABLE webhook_endpoints DROP CONSTRAINT webhook_endpoints_events_check;
ALTER TABLE webhook_endpoints ADD CONSTRAINT webhook_endpoints_events_check CHECK (
  cardinality(events) >= 1
  AND events <@ ARRAY['message.sent', 'message.failed', 'contact.unsubscribed', 'contact.resubscribed',
                      'contact.bounced', 'mailing.finished', 'contact.subscribed', 'import.finished',
                      'mailing.scheduled', 'mailing.started', 'mailing.schedule_failed',
                      'mailing.ab_winner_selected']::text[]
);

ALTER TABLE webhook_events DROP CONSTRAINT webhook_events_type_check;
ALTER TABLE webhook_events ADD CONSTRAINT webhook_events_type_check CHECK (
  type IN ('message.sent', 'message.failed', 'contact.unsubscribed', 'contact.resubscribed', 'contact.bounced',
           'mailing.finished', 'contact.subscribed', 'import.finished', 'mailing.scheduled', 'mailing.started',
           'mailing.schedule_failed', 'mailing.ab_winner_selected')
);

ALTER TABLE webhook_deliveries DROP CONSTRAINT webhook_deliveries_event_type_check;
ALTER TABLE webhook_deliveries ADD CONSTRAINT webhook_deliveries_event_type_check CHECK (
  event_type IN ('message.sent', 'message.failed', 'contact.unsubscribed', 'contact.resubscribed', 'contact.bounced',
                 'mailing.finished', 'contact.subscribed', 'import.finished', 'mailing.scheduled', 'mailing.started',
                 'mailing.schedule_failed', 'mailing.ab_winner_selected')
);
