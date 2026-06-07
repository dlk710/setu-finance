-- Derived engagement status for provider integrations.
-- STATUS ONLY: this view intentionally does not select invoice, payment, or amount columns.
CREATE OR REPLACE VIEW customer_engagement_status AS
WITH primary_emails AS (
  SELECT DISTINCT ON (customer_id)
    customer_id,
    email
  FROM customer_emails
  ORDER BY customer_id, is_primary DESC, created_at ASC, id ASC
),
overdue_invoices AS (
  SELECT
    customer_id,
    COUNT(*) FILTER (WHERE status <> 'paid' AND due_date < CURRENT_DATE) AS overdue_count,
    MIN(due_date) FILTER (WHERE status <> 'paid' AND due_date < CURRENT_DATE) AS oldest_overdue
  FROM invoices
  GROUP BY customer_id
)
SELECT
  customers.id AS customer_id,
  primary_emails.email AS email,
  CASE
    WHEN COALESCE(overdue_invoices.overdue_count, 0) = 0 THEN 'active'
    WHEN overdue_invoices.oldest_overdue >= CURRENT_DATE - INTERVAL '30 days' THEN 'dormant'
    ELSE 'inactive'
  END AS engagement_status,
  NOW() AS as_of
FROM customers
LEFT JOIN primary_emails ON primary_emails.customer_id = customers.id
LEFT JOIN overdue_invoices ON overdue_invoices.customer_id = customers.id;
