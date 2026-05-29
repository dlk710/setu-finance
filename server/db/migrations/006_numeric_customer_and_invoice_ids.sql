UPDATE customers
SET customer_code = normalized.new_code
FROM (
  SELECT
    id,
    CASE
      WHEN customer_code ~ '^[0-9]{6}$' THEN customer_code
      WHEN customer_code ~ '^[0-9]{10}$' THEN (100000 + (customer_code::bigint - 1000000000))::text
      ELSE (100000 + COALESCE(NULLIF(SUBSTRING(customer_code FROM '([0-9]+)$'), '')::bigint, 0))::text
    END AS new_code
  FROM customers
  WHERE customer_code IS NOT NULL
) AS normalized
WHERE customers.id = normalized.id
  AND customers.customer_code IS DISTINCT FROM normalized.new_code;

UPDATE invoices
SET invoice_code = normalized.new_code
FROM (
  SELECT
    id,
    CASE
      WHEN invoice_code ~ '^[0-9]{6}$' THEN invoice_code
      WHEN invoice_code ~ '^[0-9]{10}$' THEN (500000 + (invoice_code::bigint - 7000000000))::text
      ELSE (500000 + COALESCE(NULLIF(SUBSTRING(invoice_code FROM '([0-9]+)$'), '')::bigint, 0))::text
    END AS new_code
  FROM invoices
) AS normalized
WHERE invoices.id = normalized.id
  AND invoices.invoice_code IS DISTINCT FROM normalized.new_code;

UPDATE payments
SET match_summary = regexp_replace(payments.match_summary, 'CUS-[0-9]+', customers.customer_code)
FROM customers
WHERE payments.customer_id = customers.id
  AND payments.match_summary IS NOT NULL
  AND payments.match_summary LIKE '%CUS-%';

UPDATE payments
SET match_summary = regexp_replace(payments.match_summary, 'ASC-[0-9]{4}-[0-9]+', invoices.invoice_code)
FROM invoices
WHERE payments.invoice_id = invoices.id
  AND payments.match_summary IS NOT NULL
  AND payments.match_summary LIKE '%ASC-%';

INSERT INTO app_sequences (sequence_name, next_value)
SELECT
  'customer',
  COALESCE(MAX(customer_code::bigint - 100000), 0) + 1
FROM customers
WHERE customer_code ~ '^[0-9]{6}$'
ON CONFLICT (sequence_name)
DO UPDATE
SET next_value = GREATEST(app_sequences.next_value, EXCLUDED.next_value);

INSERT INTO app_sequences (sequence_name, next_value)
SELECT
  'invoice',
  COALESCE(MAX(invoice_code::bigint - 500000), 0) + 1
FROM invoices
WHERE invoice_code ~ '^[0-9]{6}$'
ON CONFLICT (sequence_name)
DO UPDATE
SET next_value = GREATEST(app_sequences.next_value, EXCLUDED.next_value);
