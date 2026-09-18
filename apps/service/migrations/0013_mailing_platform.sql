-- S4, the platform features, part 4: scheduling, A/B tests, and open and click
-- tracking (opt-in per workspace, off by default).
--
-- Conventions as in 0003. Independent of 0008, 0009, 0011 and 0012.

-- The worker's scan for scheduled mailings that are due, across workspaces.
CREATE INDEX mailings_scheduled_idx ON mailings (scheduled_at, id) WHERE status = 'scheduled';

-- ab_test: the contract's AbTestState as stored (config, status, winner). NULL
-- means no test. tracking: what was tracked for this mailing, fixed when it
-- starts ({"opens": bool, "clicks": bool}); NULL before it starts.
ALTER TABLE mailings
  ADD COLUMN ab_test jsonb CHECK (ab_test IS NULL OR jsonb_typeof(ab_test) = 'object'),
  ADD COLUMN tracking jsonb CHECK (tracking IS NULL OR jsonb_typeof(tracking) = 'object');

-- One row per A/B variant: its subject and document override the mailing's, and
-- its compiled output is stored when sending starts, like mailings.mjml/html.
CREATE TABLE mailing_variants (
  workspace_id  uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  mailing_id    uuid NOT NULL,
  key           text NOT NULL CHECK (key ~ '^[a-z]$'),
  subject       text CHECK (length(subject) BETWEEN 1 AND 998),
  document      jsonb CHECK (document IS NULL OR jsonb_typeof(document) = 'object'),
  mjml          text,
  html          text,
  PRIMARY KEY (mailing_id, key),
  CHECK (subject IS NOT NULL OR document IS NOT NULL),
  FOREIGN KEY (workspace_id, mailing_id) REFERENCES mailings (workspace_id, id) ON DELETE CASCADE
);

-- variant: which A/B variant a recipient gets (NULL: no test, or held until
-- the winner is known). held: in the remainder of an A/B test, waiting for the
-- winner; the claim skips held rows, and the mailing cannot finish while any
-- are queued.
ALTER TABLE mailing_recipients
  ADD COLUMN variant text CHECK (variant ~ '^[a-z]$'),
  ADD COLUMN held boolean NOT NULL DEFAULT false,
  ADD CONSTRAINT mailing_recipients_held_check CHECK (NOT held OR (status = 'queued' OR status = 'skipped'));
CREATE INDEX mailing_recipients_held_idx ON mailing_recipients (mailing_id) WHERE held;

-- The links of a mailing's HTML (and its variants), numbered when sending
-- starts. A click token names a link by its number; the destination is read
-- from here, never from the request, so the redirect cannot be pointed anywhere
-- else.
CREATE TABLE mailing_links (
  workspace_id  uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  mailing_id    uuid NOT NULL,
  idx           integer NOT NULL CHECK (idx >= 0),
  url           text NOT NULL CHECK (url ~ '^https?://' AND length(url) <= 4096),
  PRIMARY KEY (mailing_id, idx),
  UNIQUE (mailing_id, url),
  FOREIGN KEY (workspace_id, mailing_id) REFERENCES mailings (workspace_id, id) ON DELETE CASCADE
);

-- Tracking settings per workspace: absent means both off. The workspace's
-- settings.tracking_enabled stays the master switch (tracking.update keeps it
-- equal to opens OR clicks).
CREATE TABLE workspace_tracking (
  workspace_id  uuid PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
  opens         boolean NOT NULL DEFAULT false,
  clicks        boolean NOT NULL DEFAULT false,
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- Opens and clicks. No address, no user agent, nothing about the person beyond
-- which recipient row it was: the flags are decided on arrival and only the
-- flags are kept. Erasing a contact deletes its recipient rows, and with them
-- these events.
CREATE TABLE tracking_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  mailing_id      uuid NOT NULL,
  recipient_id    uuid NOT NULL,
  contact_id      uuid,
  variant         text CHECK (variant ~ '^[a-z]$'),
  kind            text NOT NULL CHECK (kind IN ('open', 'click')),
  link_idx        integer CHECK (link_idx >= 0),
  -- A security scanner or prefetcher, not a person.
  is_machine      boolean NOT NULL DEFAULT false,
  -- Apple Mail Privacy Protection's proxy, which loads every image on delivery.
  is_apple_mpp    boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK ((kind = 'click') = (link_idx IS NOT NULL)),
  FOREIGN KEY (workspace_id, mailing_id) REFERENCES mailings (workspace_id, id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id, recipient_id) REFERENCES mailing_recipients (workspace_id, id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id, contact_id) REFERENCES contacts (workspace_id, id) ON DELETE CASCADE
);
CREATE INDEX tracking_events_mailing_idx ON tracking_events (workspace_id, mailing_id, kind, recipient_id);
-- Segments' engagement filters: "opened within the last N days".
CREATE INDEX tracking_events_contact_idx ON tracking_events (workspace_id, contact_id, kind, created_at)
  WHERE contact_id IS NOT NULL AND NOT is_machine;
