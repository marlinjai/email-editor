-- S4, the platform features, part 2: CSV import as a resumable job.
--
-- An import is uploaded (every CSV line becomes an import_rows row), mapped
-- (which starts a dry run over every row), then committed in batches. Each
-- batch is one transaction that writes the contacts and the rows' outcomes
-- together, so a crash rolls back only the batch in flight and the next batch
-- starts at the first row without an outcome: every row is applied exactly once.
--
-- Conventions as in 0003. Independent of 0008, 0009, 0012 and 0013.

CREATE TABLE import_jobs (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id       uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  status             text NOT NULL DEFAULT 'uploaded'
                     CHECK (status IN ('uploaded', 'validating', 'validated', 'committing', 'completed', 'failed', 'cancelled')),
  file_name          text CHECK (length(file_name) <= 255),
  file_bytes         integer NOT NULL CHECK (file_bytes >= 0),
  total_rows         integer NOT NULL CHECK (total_rows >= 0),
  columns            jsonb NOT NULL CHECK (jsonb_typeof(columns) = 'array'),
  sample             jsonb NOT NULL CHECK (jsonb_typeof(sample) = 'array'),
  suggested_mapping  jsonb NOT NULL CHECK (jsonb_typeof(suggested_mapping) = 'object'),
  mapping            jsonb CHECK (mapping IS NULL OR jsonb_typeof(mapping) = 'object'),
  -- Bumped by every mapping; the dry-run plan of a row is valid only for the version it names.
  mapping_version    integer NOT NULL DEFAULT 0 CHECK (mapping_version >= 0),
  topics             text[] NOT NULL DEFAULT '{}',
  tags               text[] NOT NULL DEFAULT '{}',
  update_existing    boolean NOT NULL DEFAULT true,
  -- Who stated that the people consented, and when (the audit actor).
  consent_stated_by  jsonb,
  consent_stated_at  timestamptz,
  dry_run            jsonb CHECK (dry_run IS NULL OR jsonb_typeof(dry_run) = 'object'),
  -- Non-null once the commit started: the report of the rows written so far.
  result             jsonb CHECK (result IS NULL OR jsonb_typeof(result) = 'object'),
  processed_rows     integer NOT NULL DEFAULT 0 CHECK (processed_rows >= 0),
  -- Consecutive failed batches; reset by a batch that commits. Too many fail the import.
  failures           integer NOT NULL DEFAULT 0 CHECK (failures >= 0),
  last_failure       text,
  -- A failed batch waits until then before the worker tries again.
  next_attempt_at    timestamptz NOT NULL DEFAULT now(),
  error              text,
  created_by         jsonb NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  finished_at        timestamptz,
  UNIQUE (workspace_id, id),
  CHECK ((mapping IS NULL) = (mapping_version = 0)),
  CHECK ((status IN ('completed', 'failed', 'cancelled')) = (finished_at IS NOT NULL)),
  CHECK (status <> 'failed' OR error IS NOT NULL)
);
CREATE INDEX import_jobs_workspace_idx ON import_jobs (workspace_id, created_at DESC, id DESC);
-- The worker's scan for imports with work to do, across workspaces.
CREATE INDEX import_jobs_work_idx ON import_jobs (next_attempt_at, updated_at, id) WHERE status IN ('validating', 'committing');

-- One row per CSV line after the header. cells holds the raw text of each
-- column. email and external_id are filled from the mapped columns when a
-- mapping is set (normalised: trimmed, email lowercased), to find duplicates in
-- the file. plan_* is the dry run for mapping version plan_version; the
-- committed outcome is written once, in the batch that applies the row.
CREATE TABLE import_rows (
  workspace_id    uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  import_id       uuid NOT NULL,
  row_number      integer NOT NULL CHECK (row_number >= 1),
  cells           jsonb NOT NULL CHECK (jsonb_typeof(cells) = 'array'),
  email           text,
  external_id     text,
  plan_version    integer,
  plan_outcome    text CHECK (plan_outcome IN ('created', 'updated', 'unchanged', 'suppressed', 'skipped')),
  plan_reason     text,
  plan_message    text,
  plan_withheld   boolean NOT NULL DEFAULT false,
  outcome         text CHECK (outcome IN ('created', 'updated', 'unchanged', 'suppressed', 'skipped')),
  reason          text,
  message         text,
  withheld        boolean NOT NULL DEFAULT false,
  contact_id      uuid,
  PRIMARY KEY (import_id, row_number),
  CHECK ((plan_outcome = 'skipped') = (plan_reason IS NOT NULL)),
  CHECK ((outcome = 'skipped') = (reason IS NOT NULL)),
  FOREIGN KEY (workspace_id, import_id) REFERENCES import_jobs (workspace_id, id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id, contact_id) REFERENCES contacts (workspace_id, id) ON DELETE SET NULL (contact_id)
);
-- The next rows a batch works on.
CREATE INDEX import_rows_uncommitted_idx ON import_rows (import_id, row_number) WHERE outcome IS NULL;
-- First occurrence of an address or an external id in the file.
CREATE INDEX import_rows_email_idx ON import_rows (import_id, email, row_number) WHERE email IS NOT NULL;
CREATE INDEX import_rows_external_idx ON import_rows (import_id, external_id, row_number) WHERE external_id IS NOT NULL;
