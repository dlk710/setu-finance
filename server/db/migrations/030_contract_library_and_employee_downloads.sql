CREATE TABLE IF NOT EXISTS business_contracts (
  id TEXT PRIMARY KEY,
  owner_category TEXT NOT NULL
    CHECK (owner_category IN ('employee', 'stakeholder', 'other')),
  owner_id TEXT,
  owner_code TEXT,
  owner_name TEXT NOT NULL,
  contract_type TEXT NOT NULL,
  contract_type_label TEXT NOT NULL,
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  file_size_bytes INTEGER NOT NULL DEFAULT 0,
  storage_provider TEXT NOT NULL
    CHECK (storage_provider IN ('local', 's3')),
  storage_key TEXT NOT NULL,
  summary TEXT,
  notes TEXT,
  contract_date DATE,
  effective_date DATE,
  expiration_date DATE,
  uploaded_by_username TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS business_contracts_storage_key_idx
  ON business_contracts (storage_key);

CREATE INDEX IF NOT EXISTS business_contracts_owner_idx
  ON business_contracts (owner_category, owner_id, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS business_contracts_type_idx
  ON business_contracts (contract_type, created_at DESC);

CREATE INDEX IF NOT EXISTS business_contracts_search_idx
  ON business_contracts (owner_name, owner_code, file_name);
