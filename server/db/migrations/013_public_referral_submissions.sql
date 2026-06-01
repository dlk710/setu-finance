CREATE TABLE IF NOT EXISTS referral_submissions (
  id TEXT PRIMARY KEY,
  referrer_customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  matched_customer_id TEXT REFERENCES customers(id) ON DELETE SET NULL,
  converted_customer_id TEXT REFERENCES customers(id) ON DELETE SET NULL,
  converted_referral_id TEXT REFERENCES customer_referrals(id) ON DELETE SET NULL,
  source TEXT NOT NULL DEFAULT 'public_form',
  status TEXT NOT NULL DEFAULT 'submitted'
    CHECK (status IN ('submitted', 'converted', 'dismissed')),
  referrer_email TEXT NOT NULL,
  referred_full_name TEXT NOT NULL,
  referred_email TEXT NOT NULL,
  referred_normalized_email TEXT NOT NULL,
  referred_phone TEXT,
  referred_phone_digits TEXT,
  relationship_label TEXT,
  notes TEXT,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  converted_at TIMESTAMPTZ,
  dismissed_at TIMESTAMPTZ,
  reviewed_by_username TEXT,
  review_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS referral_submissions_status_idx
  ON referral_submissions (status, submitted_at DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS referral_submissions_referrer_idx
  ON referral_submissions (referrer_customer_id, status, submitted_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS referral_submissions_open_email_idx
  ON referral_submissions (referred_normalized_email)
  WHERE status = 'submitted';

CREATE UNIQUE INDEX IF NOT EXISTS referral_submissions_open_phone_idx
  ON referral_submissions (referred_phone_digits)
  WHERE status = 'submitted'
    AND referred_phone_digits IS NOT NULL;
