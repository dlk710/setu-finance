ALTER TABLE customer_profiles
  ADD COLUMN IF NOT EXISTS service_start_date DATE;

CREATE TABLE IF NOT EXISTS customer_contracts (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  file_size_bytes INTEGER NOT NULL DEFAULT 0,
  storage_provider TEXT NOT NULL
    CHECK (storage_provider IN ('local', 's3')),
  storage_key TEXT NOT NULL,
  extracted_text_preview TEXT,
  contract_date DATE,
  service_start_date DATE,
  total_fee NUMERIC(12, 2),
  installment_count INTEGER NOT NULL DEFAULT 0,
  parsed_fields JSONB NOT NULL DEFAULT '{}'::jsonb,
  critical_fields JSONB NOT NULL DEFAULT '{}'::jsonb,
  uploaded_by_username TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS customer_contracts_storage_key_idx
  ON customer_contracts (storage_key);

CREATE INDEX IF NOT EXISTS customer_contracts_customer_created_idx
  ON customer_contracts (customer_id, created_at DESC, id DESC);
