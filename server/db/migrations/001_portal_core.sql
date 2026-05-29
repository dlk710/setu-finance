CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY,
  initials TEXT NOT NULL,
  full_name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS customers_normalized_name_idx
  ON customers (normalized_name);

CREATE TABLE IF NOT EXISTS customer_services (
  customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  service_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (customer_id, service_name)
);

CREATE TABLE IF NOT EXISTS customer_emails (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  normalized_email TEXT NOT NULL,
  label TEXT,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS customer_emails_normalized_email_idx
  ON customer_emails (normalized_email);

CREATE TABLE IF NOT EXISTS customer_phones (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  phone_value TEXT NOT NULL,
  normalized_digits TEXT NOT NULL,
  phone_last4 TEXT NOT NULL,
  label TEXT,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS customer_phones_last4_idx
  ON customer_phones (phone_last4);

CREATE TABLE IF NOT EXISTS customer_aliases (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  alias_name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  relation TEXT,
  email TEXT,
  normalized_email TEXT,
  phone_last4 TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS customer_aliases_normalized_name_idx
  ON customer_aliases (normalized_name);

CREATE INDEX IF NOT EXISTS customer_aliases_email_idx
  ON customer_aliases (normalized_email);

CREATE INDEX IF NOT EXISTS customer_aliases_phone_last4_idx
  ON customer_aliases (phone_last4);

CREATE TABLE IF NOT EXISTS invoices (
  id TEXT PRIMARY KEY,
  invoice_code TEXT NOT NULL UNIQUE,
  customer_id TEXT NOT NULL REFERENCES customers(id),
  delivery_email TEXT,
  service_name TEXT NOT NULL,
  milestone TEXT,
  base_amount NUMERIC(12, 2) NOT NULL,
  discount_pct NUMERIC(6, 2) NOT NULL DEFAULT 0,
  zelle_amount NUMERIC(12, 2) NOT NULL,
  card_amount NUMERIC(12, 2) NOT NULL,
  due_date DATE NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft', 'sent', 'paid', 'overdue')),
  source TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS invoices_customer_status_idx
  ON invoices (customer_id, status);

CREATE INDEX IF NOT EXISTS invoices_status_due_date_idx
  ON invoices (status, due_date DESC);

CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  customer_id TEXT REFERENCES customers(id),
  invoice_id TEXT REFERENCES invoices(id),
  customer_name TEXT,
  sender_name_raw TEXT,
  sender_email TEXT,
  sender_phone_last4 TEXT,
  amount_received NUMERIC(12, 2) NOT NULL,
  matched_signals TEXT[] NOT NULL DEFAULT '{}',
  score INTEGER NOT NULL DEFAULT 0,
  source_message_id TEXT,
  subject TEXT,
  date_label TEXT,
  raw_text TEXT,
  received_at TIMESTAMPTZ,
  review_status TEXT NOT NULL CHECK (review_status IN ('pending', 'confirmed', 'exception', 'history')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS payments_source_message_id_idx
  ON payments (source_message_id)
  WHERE source_message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS payments_review_status_idx
  ON payments (review_status, created_at DESC);

CREATE TABLE IF NOT EXISTS exceptions (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('mismatch', 'ambiguous', 'unmatched')),
  sender_name TEXT NOT NULL,
  amount NUMERIC(12, 2) NOT NULL,
  expected_amount NUMERIC(12, 2),
  date_label TEXT NOT NULL,
  sender_email TEXT,
  sender_phone_last4 TEXT,
  service_name TEXT,
  milestone TEXT,
  invoice_id TEXT REFERENCES invoices(id),
  summary TEXT NOT NULL,
  alias_name TEXT,
  source_message_id TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  resolution_action TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS exceptions_status_idx
  ON exceptions (status, created_at DESC);

CREATE TABLE IF NOT EXISTS exception_candidates (
  exception_id TEXT NOT NULL REFERENCES exceptions(id) ON DELETE CASCADE,
  customer_id TEXT NOT NULL REFERENCES customers(id),
  candidate_name TEXT NOT NULL,
  note TEXT NOT NULL,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (exception_id, customer_id)
);

CREATE TABLE IF NOT EXISTS activity_events (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS activity_events_created_at_idx
  ON activity_events (created_at DESC);

CREATE TABLE IF NOT EXISTS processed_messages (
  message_id TEXT PRIMARY KEY,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS integration_states (
  integration_key TEXT PRIMARY KEY,
  state_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS app_sequences (
  sequence_name TEXT PRIMARY KEY,
  next_value BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS dashboard_snapshots (
  period_key TEXT PRIMARY KEY,
  date_label TEXT NOT NULL,
  period_label TEXT NOT NULL,
  collected NUMERIC(12, 2) NOT NULL,
  outstanding NUMERIC(12, 2) NOT NULL,
  expected NUMERIC(12, 2) NOT NULL,
  auto_match_rate TEXT NOT NULL,
  avg_days_to_pay TEXT NOT NULL,
  active_customers INTEGER NOT NULL,
  manual_hours_saved TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS dashboard_aging_buckets (
  period_key TEXT NOT NULL REFERENCES dashboard_snapshots(period_key) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL,
  label TEXT NOT NULL,
  amount NUMERIC(12, 2) NOT NULL,
  width INTEGER NOT NULL,
  tone TEXT NOT NULL,
  PRIMARY KEY (period_key, sort_order)
);

CREATE TABLE IF NOT EXISTS dashboard_collection_series (
  period_key TEXT NOT NULL REFERENCES dashboard_snapshots(period_key) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL,
  month_label TEXT NOT NULL,
  zelle NUMERIC(12, 2) NOT NULL,
  stripe NUMERIC(12, 2) NOT NULL,
  PRIMARY KEY (period_key, sort_order)
);
