INSERT INTO exception_resolution_history (
  id,
  exception_id,
  exception_kind,
  sender_name,
  amount,
  expected_amount,
  date_label,
  sender_email,
  sender_phone_last4,
  service_name,
  milestone,
  invoice_id,
  summary,
  alias_name,
  source_message_id,
  source_provider,
  transaction_reference,
  memo,
  matched_signals,
  score,
  resolution_action,
  resolution_message,
  resolved_by_username,
  resolved_customer_id,
  resolved_payment_id,
  original_exception_created_at,
  resolved_at
)
SELECT
  'hist-backfill-' || exceptions.id,
  exceptions.id,
  exceptions.kind,
  exceptions.sender_name,
  exceptions.amount,
  exceptions.expected_amount,
  exceptions.date_label,
  exceptions.sender_email,
  exceptions.sender_phone_last4,
  exceptions.service_name,
  exceptions.milestone,
  exceptions.invoice_id,
  exceptions.summary,
  exceptions.alias_name,
  exceptions.source_message_id,
  COALESCE(payments.source_provider, 'gmail'),
  payments.transaction_reference,
  payments.memo,
  COALESCE(payments.matched_signals, '{}'::text[]),
  COALESCE(payments.score, 0),
  COALESCE(exceptions.resolution_action, 'resolved'),
  exceptions.summary,
  'admin',
  payments.customer_id,
  payments.id,
  exceptions.created_at,
  COALESCE(exceptions.resolved_at, NOW())
FROM exceptions
LEFT JOIN payments
  ON payments.source_message_id = exceptions.source_message_id
WHERE exceptions.status = 'resolved'
  AND NOT EXISTS (
    SELECT 1
    FROM exception_resolution_history
    WHERE exception_resolution_history.exception_id = exceptions.id
  );
