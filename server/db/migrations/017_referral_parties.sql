CREATE TABLE IF NOT EXISTS referral_parties (
  id TEXT PRIMARY KEY,
  party_type TEXT NOT NULL CHECK (party_type IN ('client', 'employee', 'sales_partner', 'external_partner')),
  display_name TEXT NOT NULL,
  email TEXT,
  phone_digits TEXT,
  customer_id TEXT REFERENCES customers(id) ON DELETE SET NULL,
  referral_code TEXT UNIQUE,
  payout_method TEXT NOT NULL DEFAULT 'invoice_discount' CHECK (payout_method IN ('invoice_discount', 'payroll', 'vendor_payment', 'manual')),
  payout_handle TEXT,
  tax_status TEXT NOT NULL DEFAULT 'not_required' CHECK (tax_status IN ('not_required', 'needed', 'collected')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_referral_parties_party_type ON referral_parties(party_type);
CREATE INDEX IF NOT EXISTS idx_referral_parties_customer_id ON referral_parties(customer_id);
CREATE INDEX IF NOT EXISTS idx_referral_parties_status ON referral_parties(status);
CREATE INDEX IF NOT EXISTS idx_referral_parties_email ON referral_parties(LOWER(email));

ALTER TABLE customer_referrals
  ADD COLUMN IF NOT EXISTS referrer_party_id TEXT REFERENCES referral_parties(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS referral_code TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS legitimacy_status TEXT NOT NULL DEFAULT 'pending_review' CHECK (legitimacy_status IN ('pending_review', 'verified', 'rejected', 'abuse_flagged')),
  ADD COLUMN IF NOT EXISTS legitimacy_reviewed_by TEXT,
  ADD COLUMN IF NOT EXISTS legitimacy_reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS legitimacy_notes TEXT,
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_customer_referrals_referrer_party_id ON customer_referrals(referrer_party_id);
CREATE INDEX IF NOT EXISTS idx_customer_referrals_referral_code ON customer_referrals(referral_code);
CREATE INDEX IF NOT EXISTS idx_customer_referrals_legitimacy_status ON customer_referrals(legitimacy_status);

ALTER TABLE referral_submissions
  ADD COLUMN IF NOT EXISTS referrer_party_id TEXT REFERENCES referral_parties(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_referral_submissions_referrer_party_id ON referral_submissions(referrer_party_id);

ALTER TABLE customer_reward_ledger
  ADD COLUMN IF NOT EXISTS delivery_method TEXT NOT NULL DEFAULT 'invoice_discount' CHECK (delivery_method IN ('invoice_discount', 'payroll', 'vendor_payment', 'manual')),
  ADD COLUMN IF NOT EXISTS party_id TEXT REFERENCES referral_parties(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_customer_reward_ledger_party_id ON customer_reward_ledger(party_id);

CREATE TABLE IF NOT EXISTS referral_events (
  id TEXT PRIMARY KEY,
  referral_id TEXT REFERENCES customer_referrals(id) ON DELETE SET NULL,
  referral_code TEXT,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'referral_submitted',
    'intake_approved',
    'intake_rejected',
    'qualification_updated',
    'reward_accrued',
    'reward_applied',
    'payout_scheduled',
    'payout_paid',
    'abuse_flagged'
  )),
  from_status TEXT,
  to_status TEXT,
  actor_username TEXT,
  actor_kind TEXT NOT NULL DEFAULT 'admin' CHECK (actor_kind IN ('admin', 'system', 'public_referrer')),
  detail TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_referral_events_referral_id ON referral_events(referral_id);
CREATE INDEX IF NOT EXISTS idx_referral_events_referral_code ON referral_events(referral_code);
CREATE INDEX IF NOT EXISTS idx_referral_events_event_type ON referral_events(event_type);
CREATE INDEX IF NOT EXISTS idx_referral_events_created_at ON referral_events(created_at);
