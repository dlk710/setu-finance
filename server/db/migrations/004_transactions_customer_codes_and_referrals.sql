ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS customer_code TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS customers_customer_code_idx
  ON customers (customer_code)
  WHERE customer_code IS NOT NULL;

WITH numbered_customers AS (
  SELECT
    id,
    ROW_NUMBER() OVER (ORDER BY created_at ASC, id ASC) AS sequence_number
  FROM customers
  WHERE customer_code IS NULL
)
UPDATE customers
SET customer_code = 'CUS-' || LPAD(numbered_customers.sequence_number::text, 5, '0')
FROM numbered_customers
WHERE customers.id = numbered_customers.id;

INSERT INTO app_sequences (sequence_name, next_value)
SELECT
  'customer',
  COALESCE(MAX(CAST(SUBSTRING(customer_code FROM '([0-9]+)$') AS BIGINT)), 0) + 1
FROM customers
ON CONFLICT (sequence_name)
DO UPDATE
SET next_value = GREATEST(app_sequences.next_value, EXCLUDED.next_value);

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS source_provider TEXT NOT NULL DEFAULT 'gmail',
  ADD COLUMN IF NOT EXISTS source_thread_id TEXT,
  ADD COLUMN IF NOT EXISTS message_from_email TEXT,
  ADD COLUMN IF NOT EXISTS message_to_email TEXT,
  ADD COLUMN IF NOT EXISTS message_date_header TEXT,
  ADD COLUMN IF NOT EXISTS transaction_date DATE,
  ADD COLUMN IF NOT EXISTS transaction_reference TEXT,
  ADD COLUMN IF NOT EXISTS memo TEXT,
  ADD COLUMN IF NOT EXISTS parsed_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS match_status TEXT NOT NULL DEFAULT 'pending_review'
    CHECK (match_status IN ('pending_review', 'matched', 'ambiguous', 'mismatch', 'unmatched', 'applied')),
  ADD COLUMN IF NOT EXISTS match_summary TEXT,
  ADD COLUMN IF NOT EXISTS review_notes TEXT,
  ADD COLUMN IF NOT EXISTS applied_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS receipt_sent_to_email TEXT,
  ADD COLUMN IF NOT EXISTS receipt_sent_at TIMESTAMPTZ;

UPDATE payments
SET match_status = CASE
  WHEN review_status IN ('confirmed', 'history') THEN 'applied'
  WHEN review_status = 'pending' THEN 'matched'
  ELSE 'unmatched'
END
WHERE match_status = 'pending_review';

CREATE INDEX IF NOT EXISTS payments_match_status_idx
  ON payments (match_status, created_at DESC);

CREATE INDEX IF NOT EXISTS payments_transaction_reference_idx
  ON payments (transaction_reference);

CREATE TABLE IF NOT EXISTS system_settings (
  setting_key TEXT PRIMARY KEY,
  setting_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO system_settings (setting_key, setting_json, updated_at)
VALUES (
  'referral_program',
  jsonb_build_object(
    'enabled', true,
    'bonusAmount', 500,
    'qualifyingPaidAmount', 3000,
    'qualificationMonths', 6
  ),
  NOW()
)
ON CONFLICT (setting_key) DO NOTHING;

CREATE TABLE IF NOT EXISTS customer_referrals (
  id TEXT PRIMARY KEY,
  referrer_customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  referred_customer_id TEXT NOT NULL UNIQUE REFERENCES customers(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'qualified', 'awarded', 'disabled')),
  bonus_amount NUMERIC(12, 2) NOT NULL,
  qualifying_paid_amount NUMERIC(12, 2) NOT NULL,
  qualifying_months INTEGER NOT NULL,
  program_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  notes TEXT,
  qualified_at TIMESTAMPTZ,
  awarded_at TIMESTAMPTZ,
  disabled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS customer_referrals_referrer_status_idx
  ON customer_referrals (referrer_customer_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS customer_referrals_referred_status_idx
  ON customer_referrals (referred_customer_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS customer_reward_ledger (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  referral_id TEXT REFERENCES customer_referrals(id) ON DELETE SET NULL,
  reward_type TEXT NOT NULL DEFAULT 'referral_bonus',
  status TEXT NOT NULL DEFAULT 'available'
    CHECK (status IN ('available', 'applied', 'cancelled')),
  amount NUMERIC(12, 2) NOT NULL,
  description TEXT,
  earned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  applied_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS customer_reward_ledger_customer_status_idx
  ON customer_reward_ledger (customer_id, status, earned_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS customer_reward_ledger_referral_bonus_idx
  ON customer_reward_ledger (referral_id, reward_type)
  WHERE referral_id IS NOT NULL;
