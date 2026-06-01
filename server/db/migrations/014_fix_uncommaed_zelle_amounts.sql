WITH parsed_payment_amounts AS (
  SELECT
    id,
    source_message_id,
    ROUND(REPLACE(
      (regexp_match(
        raw_text,
        '(?i)(?:sent|payment|paid|amount)[^$]{0,40}\$([0-9]+(?:,[0-9]{3})*(?:\.[0-9]{1,2})?)'
      ))[1],
      ',',
      ''
    )::numeric, 2) AS parsed_amount
  FROM payments
  WHERE raw_text IS NOT NULL
    AND raw_text ILIKE '%Amount $%'
),
valid_payment_amounts AS (
  SELECT id, source_message_id, parsed_amount
  FROM parsed_payment_amounts
  WHERE parsed_amount IS NOT NULL
)
UPDATE payments
SET amount_received = valid_payment_amounts.parsed_amount,
    parsed_payload = jsonb_set(
      COALESCE(payments.parsed_payload, '{}'::jsonb),
      '{amountReceived}',
      to_jsonb(valid_payment_amounts.parsed_amount),
      true
    ),
    updated_at = NOW()
FROM valid_payment_amounts
WHERE payments.id = valid_payment_amounts.id
  AND ROUND(payments.amount_received, 2) <> valid_payment_amounts.parsed_amount;

WITH parsed_payment_amounts AS (
  SELECT
    source_message_id,
    ROUND(REPLACE(
      (regexp_match(
        raw_text,
        '(?i)(?:sent|payment|paid|amount)[^$]{0,40}\$([0-9]+(?:,[0-9]{3})*(?:\.[0-9]{1,2})?)'
      ))[1],
      ',',
      ''
    )::numeric, 2) AS parsed_amount
  FROM payments
  WHERE raw_text IS NOT NULL
    AND source_message_id IS NOT NULL
    AND raw_text ILIKE '%Amount $%'
),
valid_payment_amounts AS (
  SELECT DISTINCT ON (source_message_id) source_message_id, parsed_amount
  FROM parsed_payment_amounts
  WHERE parsed_amount IS NOT NULL
  ORDER BY source_message_id
)
UPDATE exceptions
SET amount = valid_payment_amounts.parsed_amount
FROM valid_payment_amounts
WHERE exceptions.source_message_id = valid_payment_amounts.source_message_id
  AND ROUND(exceptions.amount, 2) <> valid_payment_amounts.parsed_amount;
