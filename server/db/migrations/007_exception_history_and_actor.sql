ALTER TABLE activity_events
  ADD COLUMN IF NOT EXISTS actor_username TEXT;

CREATE TABLE IF NOT EXISTS exception_resolution_history (
  id TEXT PRIMARY KEY,
  exception_id TEXT NOT NULL,
  exception_kind TEXT NOT NULL,
  sender_name TEXT NOT NULL,
  amount NUMERIC(12, 2) NOT NULL,
  expected_amount NUMERIC(12, 2),
  date_label TEXT NOT NULL,
  sender_email TEXT,
  sender_phone_last4 TEXT,
  service_name TEXT,
  milestone TEXT,
  invoice_id TEXT REFERENCES invoices(id) ON DELETE SET NULL,
  summary TEXT NOT NULL,
  alias_name TEXT,
  source_message_id TEXT,
  source_provider TEXT,
  transaction_reference TEXT,
  memo TEXT,
  matched_signals TEXT[] NOT NULL DEFAULT '{}',
  score INTEGER NOT NULL DEFAULT 0,
  resolution_action TEXT NOT NULL,
  resolution_message TEXT,
  resolved_by_username TEXT NOT NULL,
  resolved_customer_id TEXT REFERENCES customers(id) ON DELETE SET NULL,
  resolved_payment_id TEXT REFERENCES payments(id) ON DELETE SET NULL,
  original_exception_created_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS exception_resolution_history_resolved_at_idx
  ON exception_resolution_history (resolved_at DESC);

CREATE INDEX IF NOT EXISTS exception_resolution_history_customer_idx
  ON exception_resolution_history (resolved_customer_id, resolved_at DESC);

CREATE INDEX IF NOT EXISTS exception_resolution_history_source_message_idx
  ON exception_resolution_history (source_message_id, resolved_at DESC);
