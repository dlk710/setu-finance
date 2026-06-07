ALTER TABLE exceptions
  DROP CONSTRAINT IF EXISTS exceptions_status_check;

ALTER TABLE exceptions
  ADD CONSTRAINT exceptions_status_check
  CHECK (status IN ('open', 'resolved', 'archived', 'deleted'));

ALTER TABLE exceptions
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archived_by_username TEXT,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_by_username TEXT,
  ADD COLUMN IF NOT EXISTS delete_reason TEXT;

UPDATE exceptions
SET archived_at = COALESCE(archived_at, resolved_at),
    archived_by_username = COALESCE(archived_by_username, 'system')
WHERE status = 'archived';

CREATE INDEX IF NOT EXISTS exceptions_archived_idx
  ON exceptions (status, archived_at DESC, resolved_at DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS exceptions_deleted_idx
  ON exceptions (status, deleted_at DESC, created_at DESC);
