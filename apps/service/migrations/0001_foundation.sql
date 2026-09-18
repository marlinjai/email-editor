-- S0, the foundation: workspaces, their members, API keys, the audit log, and
-- the idempotency ledger every mutating route shares.
--
-- Every workspace-owned table carries workspace_id and is only ever read or
-- written through a repository function that takes that id first
-- (src/repo/*.ts). Nothing here is ever edited once applied: a change is a new,
-- higher-numbered file.

CREATE TABLE workspaces (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND length(slug) <= 64),
  name        text NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  settings    jsonb NOT NULL DEFAULT '{"default_locale":"en","locales":["en"],"tracking_enabled":false}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Humans, identified by their auth-brain subject. The service never sees a
-- login: the dashboard vouches for the subject with its service token.
CREATE TABLE workspace_members (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  subject       text NOT NULL CHECK (length(subject) BETWEEN 1 AND 255),
  email         text NOT NULL CHECK (email = lower(email)),
  name          text,
  role          text NOT NULL CHECK (role IN ('owner', 'admin', 'editor', 'viewer')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, subject),
  UNIQUE (workspace_id, email)
);
CREATE INDEX workspace_members_subject_idx ON workspace_members (subject);

-- Client credentials. Only the SHA-256 of the key is stored; the plaintext is
-- returned once, at creation. A key is revoked, never deleted, so the audit log
-- keeps pointing at something.
CREATE TABLE api_keys (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name          text NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  prefix        text NOT NULL,
  key_hash      text NOT NULL UNIQUE CHECK (key_hash ~ '^[0-9a-f]{64}$'),
  scope         text NOT NULL DEFAULT 'full' CHECK (scope IN ('full', 'read', 'send')),
  created_by    jsonb NOT NULL,
  last_used_at  timestamptz,
  revoked_at    timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX api_keys_workspace_idx ON api_keys (workspace_id, created_at DESC, id DESC);

CREATE TABLE audit_log (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  action        text NOT NULL,
  actor         jsonb NOT NULL,
  target_type   text NOT NULL,
  target_id     text,
  details       jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX audit_log_workspace_idx ON audit_log (workspace_id, created_at DESC, id DESC);

-- One row per (scope, Idempotency-Key). The scope is the workspace for every
-- workspace-bound call ("ws:<uuid>") and the acting person for the one call that
-- has no workspace yet, creating one ("subject:<auth-brain subject>").
-- request_hash fingerprints method, path and body, so the same key with a
-- different request is refused instead of replaying the wrong answer.
CREATE TABLE idempotency_keys (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope            text NOT NULL,
  workspace_id     uuid REFERENCES workspaces(id) ON DELETE CASCADE,
  key              text NOT NULL CHECK (length(key) BETWEEN 1 AND 255),
  request_hash     text NOT NULL,
  state            text NOT NULL DEFAULT 'in_progress' CHECK (state IN ('in_progress', 'completed')),
  response_status  integer,
  response_body    text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  completed_at     timestamptz,
  UNIQUE (scope, key)
);
CREATE INDEX idempotency_keys_created_idx ON idempotency_keys (created_at);
