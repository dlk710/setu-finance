DROP INDEX IF EXISTS payments_confirmed_transaction_reference_once_idx;

CREATE UNIQUE INDEX IF NOT EXISTS payments_confirmed_transaction_reference_once_idx
  ON payments (source_provider, transaction_reference)
  WHERE transaction_reference IS NOT NULL
    AND review_status = 'confirmed';

CREATE UNIQUE INDEX IF NOT EXISTS payments_confirmed_zelle_transaction_reference_once_idx
  ON payments (LOWER(transaction_reference))
  WHERE transaction_reference IS NOT NULL
    AND review_status = 'confirmed'
    AND source_provider IN ('gmail', 'zelle', 'manual_zelle');
