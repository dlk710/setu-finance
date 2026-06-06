CREATE TABLE IF NOT EXISTS referral_payouts (
  id TEXT PRIMARY KEY,
  party_id TEXT NOT NULL REFERENCES referral_parties(id) ON DELETE RESTRICT,
  referral_id TEXT REFERENCES customer_referrals(id) ON DELETE SET NULL,
  reward_ledger_id TEXT REFERENCES customer_reward_ledger(id) ON DELETE SET NULL,
  amount NUMERIC(12, 2) NOT NULL CHECK (amount >= 0),
  payout_method TEXT NOT NULL CHECK (payout_method IN ('payroll', 'vendor_payment', 'manual')),
  payout_status TEXT NOT NULL DEFAULT 'scheduled' CHECK (payout_status IN ('scheduled', 'paid', 'cancelled')),
  scheduled_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  notes TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_referral_payouts_party_id ON referral_payouts(party_id);
CREATE INDEX IF NOT EXISTS idx_referral_payouts_referral_id ON referral_payouts(referral_id);
CREATE INDEX IF NOT EXISTS idx_referral_payouts_reward_ledger_id ON referral_payouts(reward_ledger_id);
CREATE INDEX IF NOT EXISTS idx_referral_payouts_status ON referral_payouts(payout_status);
CREATE INDEX IF NOT EXISTS idx_referral_payouts_scheduled_at ON referral_payouts(scheduled_at);
