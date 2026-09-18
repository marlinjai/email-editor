-- S1, editor and templates: template documents with their immutable version
-- history, and uploaded image assets.
--
-- As in 0001, every table carries workspace_id and is only read or written
-- through a repository function that takes that id first. The one exception is
-- the public asset URL (/a/:id), which looks an asset up by its unguessable id
-- alone, because an email client fetching an image has no credentials.

-- The current state of a template. `version` is the optimistic-lock token: a
-- save names the version it was based on and only succeeds while that is still
-- the current one. `schema_version` is the document's own `version` field
-- ("1.0"), kept in a column so a later migration can find the documents that
-- still need upgrading without parsing every one.
CREATE TABLE templates (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name            text NOT NULL CHECK (length(name) BETWEEN 1 AND 200),
  description     text CHECK (description IS NULL OR length(description) <= 2000),
  document        jsonb NOT NULL CHECK (jsonb_typeof(document) = 'object'),
  schema_version  text NOT NULL CHECK (schema_version ~ '^[0-9]+\.[0-9]+$'),
  version         integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  thumbnail_url   text,
  archived_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX templates_workspace_idx ON templates (workspace_id, updated_at DESC, id DESC);

-- One row per saved version of a template, written in the same transaction as
-- the change that produced it, and never changed afterwards: restoring an old
-- version saves its document as a new version. The trigger below makes the
-- history append-only for every writer, not only for this service's code.
CREATE TABLE template_versions (
  workspace_id    uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  template_id     uuid NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
  version         integer NOT NULL CHECK (version >= 1),
  document        jsonb NOT NULL CHECK (jsonb_typeof(document) = 'object'),
  schema_version  text NOT NULL CHECK (schema_version ~ '^[0-9]+\.[0-9]+$'),
  created_by      text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (template_id, version)
);
CREATE INDEX template_versions_workspace_idx ON template_versions (workspace_id, template_id, version DESC);

CREATE FUNCTION template_versions_append_only() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'template_versions rows are immutable; save a new version instead';
END;
$$;
CREATE TRIGGER template_versions_no_update
  BEFORE UPDATE ON template_versions
  FOR EACH ROW EXECUTE FUNCTION template_versions_append_only();

-- Uploaded images. The bytes live in Storage Brain (storage_file_id); the
-- service serves them at its own stable URL, so a mail never carries a signed
-- URL that expires while the mail is still in an inbox. content_type is the type
-- sniffed from the bytes, never the one the uploader claimed.
CREATE TABLE assets (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id     uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  storage_file_id  text NOT NULL,
  content_type     text NOT NULL CHECK (content_type IN ('image/png', 'image/jpeg', 'image/gif', 'image/webp')),
  size_bytes       integer NOT NULL CHECK (size_bytes BETWEEN 1 AND 10485760),
  width            integer CHECK (width IS NULL OR width >= 1),
  height           integer CHECK (height IS NULL OR height >= 1),
  filename         text NOT NULL CHECK (length(filename) BETWEEN 1 AND 255),
  sha256           text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  created_by       jsonb NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX assets_workspace_idx ON assets (workspace_id, created_at DESC, id DESC);
