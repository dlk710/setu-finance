ALTER TABLE customer_profiles
  ADD COLUMN IF NOT EXISTS fee_type TEXT NOT NULL DEFAULT 'one_time'
    CHECK (fee_type IN ('one_time', 'recurring'));

UPDATE customer_profiles
SET fee_type = CASE
  WHEN billing_cadence = 'monthly' THEN 'recurring'
  ELSE 'one_time'
END
WHERE fee_type IS DISTINCT FROM CASE
  WHEN billing_cadence = 'monthly' THEN 'recurring'
  ELSE 'one_time'
END;
