ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS duplicate_of_payment_id TEXT REFERENCES payments(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS payments_duplicate_of_payment_id_idx
  ON payments (duplicate_of_payment_id)
  WHERE duplicate_of_payment_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS payments_confirmed_invoice_once_idx
  ON payments (invoice_id)
  WHERE invoice_id IS NOT NULL
    AND review_status = 'confirmed';

CREATE UNIQUE INDEX IF NOT EXISTS payments_confirmed_transaction_reference_once_idx
  ON payments (source_provider, transaction_reference)
  WHERE transaction_reference IS NOT NULL
    AND review_status = 'confirmed';

ALTER TABLE exceptions
  DROP CONSTRAINT IF EXISTS exceptions_kind_check;

ALTER TABLE exceptions
  ADD CONSTRAINT exceptions_kind_check
  CHECK (kind IN ('mismatch', 'ambiguous', 'unmatched', 'duplicate'));
