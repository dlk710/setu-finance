CREATE TABLE IF NOT EXISTS auth_audit_events (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('success', 'failure', 'info')),
  username TEXT,
  user_id TEXT,
  actor_username TEXT,
  ip_hash TEXT,
  user_agent_hash TEXT,
  request_method TEXT,
  request_path TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS auth_audit_events_created_at_idx
  ON auth_audit_events (created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS auth_audit_events_type_outcome_idx
  ON auth_audit_events (event_type, outcome, created_at DESC);

CREATE INDEX IF NOT EXISTS auth_audit_events_username_idx
  ON auth_audit_events (username, created_at DESC)
  WHERE username IS NOT NULL;
