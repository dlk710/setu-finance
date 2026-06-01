CREATE TABLE IF NOT EXISTS feedback_submissions (
  id TEXT PRIMARY KEY,
  customer_id TEXT REFERENCES customers(id) ON DELETE SET NULL,
  submitted_name TEXT NOT NULL,
  submitted_email TEXT NOT NULL,
  submitted_phone TEXT,
  normalized_email TEXT NOT NULL,
  phone_digits TEXT,
  category TEXT NOT NULL DEFAULT 'general',
  rating INTEGER CHECK (rating IS NULL OR (rating >= 1 AND rating <= 5)),
  message TEXT NOT NULL,
  attachments JSONB NOT NULL DEFAULT '[]'::jsonb,
  source TEXT NOT NULL DEFAULT 'public_form',
  status TEXT NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'reviewed', 'archived')),
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ,
  reviewed_by_username TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS feedback_submissions_status_idx
  ON feedback_submissions (status, submitted_at DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS feedback_submissions_customer_idx
  ON feedback_submissions (customer_id, submitted_at DESC)
  WHERE customer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS feedback_submissions_email_idx
  ON feedback_submissions (normalized_email, submitted_at DESC);
