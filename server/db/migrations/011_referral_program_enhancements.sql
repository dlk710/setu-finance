ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS referral_bonus_amount NUMERIC(12, 2) NOT NULL DEFAULT 0;

ALTER TABLE customer_referrals
  ADD COLUMN IF NOT EXISTS relationship_label TEXT,
  ADD COLUMN IF NOT EXISTS referred_on DATE;

ALTER TABLE customer_reward_ledger
  ADD COLUMN IF NOT EXISTS applied_invoice_id TEXT REFERENCES invoices(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS applied_by_username TEXT;

CREATE TABLE IF NOT EXISTS invoice_reward_applications (
  id TEXT PRIMARY KEY,
  invoice_id TEXT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  reward_id TEXT NOT NULL UNIQUE REFERENCES customer_reward_ledger(id) ON DELETE RESTRICT,
  customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  reward_type TEXT NOT NULL DEFAULT 'referral_bonus',
  amount_applied NUMERIC(12, 2) NOT NULL,
  applied_by_username TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS invoice_reward_applications_invoice_idx
  ON invoice_reward_applications (invoice_id, created_at DESC);

CREATE INDEX IF NOT EXISTS invoice_reward_applications_customer_idx
  ON invoice_reward_applications (customer_id, created_at DESC);

UPDATE customer_referrals
SET status = 'qualified',
    qualified_at = COALESCE(qualified_at, awarded_at),
    updated_at = NOW()
WHERE status = 'awarded'
  AND id IN (
    SELECT referral_id
    FROM customer_reward_ledger
    WHERE reward_type = 'referral_bonus'
      AND status = 'available'
      AND referral_id IS NOT NULL
  );
