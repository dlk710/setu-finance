ALTER TABLE customer_profiles
  ADD COLUMN IF NOT EXISTS home_address_line1 TEXT,
  ADD COLUMN IF NOT EXISTS home_address_line2 TEXT,
  ADD COLUMN IF NOT EXISTS home_city TEXT,
  ADD COLUMN IF NOT EXISTS home_state TEXT,
  ADD COLUMN IF NOT EXISTS home_postal_code TEXT,
  ADD COLUMN IF NOT EXISTS home_country TEXT;

CREATE TABLE IF NOT EXISTS customer_service_enrollments (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  service_name TEXT NOT NULL,
  service_code TEXT,
  is_custom BOOLEAN NOT NULL DEFAULT FALSE,
  enrolled_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS customer_service_enrollments_customer_date_idx
  ON customer_service_enrollments (customer_id, enrolled_at DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS customer_service_enrollments_service_code_idx
  ON customer_service_enrollments (service_code);

INSERT INTO customer_service_enrollments (
  id,
  customer_id,
  service_name,
  service_code,
  is_custom,
  enrolled_at,
  created_at
)
SELECT
  'svc-' || customer_services.customer_id || '-' || md5(customer_services.service_name),
  customer_services.customer_id,
  customer_services.service_name,
  NULL,
  FALSE,
  COALESCE(customer_profiles.onboarded_at, customers.created_at, NOW()),
  NOW()
FROM customer_services
JOIN customers ON customers.id = customer_services.customer_id
LEFT JOIN customer_profiles ON customer_profiles.customer_id = customer_services.customer_id
LEFT JOIN customer_service_enrollments
  ON customer_service_enrollments.customer_id = customer_services.customer_id
 AND customer_service_enrollments.service_name = customer_services.service_name
WHERE customer_service_enrollments.id IS NULL;
