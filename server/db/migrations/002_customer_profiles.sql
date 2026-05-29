CREATE TABLE IF NOT EXISTS customer_profiles (
  customer_id TEXT PRIMARY KEY REFERENCES customers(id) ON DELETE CASCADE,
  onboarding_status TEXT NOT NULL DEFAULT 'complete'
    CHECK (onboarding_status IN ('complete', 'needs_follow_up')),
  intake_source TEXT NOT NULL DEFAULT 'seed'
    CHECK (intake_source IN ('onboarding', 'invoice', 'seed', 'import')),
  preferred_payment_method TEXT NOT NULL DEFAULT 'zelle'
    CHECK (preferred_payment_method IN ('zelle', 'card', 'both')),
  billing_cadence TEXT NOT NULL DEFAULT 'per_milestone'
    CHECK (billing_cadence IN ('per_milestone', 'monthly', 'custom')),
  referral_source TEXT,
  billing_notes TEXT,
  onboarded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS customer_profiles_status_idx
  ON customer_profiles (onboarding_status, onboarded_at DESC);

INSERT INTO customer_profiles (
  customer_id,
  onboarding_status,
  intake_source,
  preferred_payment_method,
  billing_cadence,
  onboarded_at,
  updated_at
)
SELECT
  customers.id,
  'complete',
  'seed',
  'zelle',
  'per_milestone',
  NOW(),
  NOW()
FROM customers
LEFT JOIN customer_profiles ON customer_profiles.customer_id = customers.id
WHERE customer_profiles.customer_id IS NULL;
