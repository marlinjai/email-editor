-- S3: invitations. How a person who is not a member yet joins a workspace
-- (contract: packages/mail-contract/src/invites.ts, routes invites.*).
--
-- The token is shown once, at creation; only its SHA-256 is stored. An
-- invitation is single use (accepted_at), revocable (revoked_at) and expires
-- (expires_at); its status is derived from those, never stored. The inviter is
-- kept as a member reference (NULL once they leave) plus their address, for
-- the list; acceptance re-checks that the inviter is still a member able to
-- grant the role. Additive only.

CREATE TABLE workspace_invites (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id          uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  token_hash            text NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  email                 text NOT NULL CHECK (email = lower(email) AND length(email) BETWEEN 3 AND 254),
  role                  text NOT NULL CHECK (role IN ('owner', 'admin', 'editor', 'viewer')),
  invited_by_member_id  uuid REFERENCES workspace_members(id) ON DELETE SET NULL,
  invited_by_email      text,
  expires_at            timestamptz NOT NULL,
  accepted_at           timestamptz,
  accepted_member_id    uuid REFERENCES workspace_members(id) ON DELETE SET NULL,
  revoked_at            timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  CHECK (accepted_at IS NULL OR revoked_at IS NULL),
  CHECK (expires_at > created_at)
);
CREATE INDEX workspace_invites_workspace_idx ON workspace_invites (workspace_id, created_at DESC, id DESC);
CREATE INDEX workspace_invites_email_idx ON workspace_invites (workspace_id, email);
