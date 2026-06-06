INSERT INTO app_sequences (sequence_name, next_value)
VALUES ('referral', 1)
ON CONFLICT (sequence_name) DO NOTHING;

INSERT INTO system_settings (setting_key, setting_json)
VALUES ('referral_party_backfill', jsonb_build_object('cutoff', NOW()))
ON CONFLICT (setting_key) DO NOTHING;

WITH referrer_customers AS (
  SELECT DISTINCT referrer_customer_id AS customer_id
  FROM customer_referrals
  WHERE referrer_customer_id IS NOT NULL
  UNION
  SELECT DISTINCT referrer_customer_id AS customer_id
  FROM referral_submissions
  WHERE referrer_customer_id IS NOT NULL
),
customer_profiles AS (
  SELECT
    c.id,
    c.customer_code,
    c.full_name,
    email_profile.email,
    phone_profile.phone_digits
  FROM referrer_customers rc
  JOIN customers c ON c.id = rc.customer_id
  LEFT JOIN LATERAL (
    SELECT ce.email
    FROM customer_emails ce
    WHERE ce.customer_id = c.id
    ORDER BY ce.is_primary DESC, ce.created_at ASC
    LIMIT 1
  ) email_profile ON TRUE
  LEFT JOIN LATERAL (
    SELECT cp.normalized_digits AS phone_digits
    FROM customer_phones cp
    WHERE cp.customer_id = c.id
    ORDER BY cp.is_primary DESC, cp.created_at ASC
    LIMIT 1
  ) phone_profile ON TRUE
)
INSERT INTO referral_parties (
  id,
  party_type,
  display_name,
  email,
  phone_digits,
  customer_id,
  referral_code,
  payout_method,
  tax_status,
  status
)
SELECT
  'party-client-' || cp.id,
  'client',
  cp.full_name,
  cp.email,
  cp.phone_digits,
  cp.id,
  'PTY-' || COALESCE(NULLIF(cp.customer_code, ''), SUBSTRING(MD5(cp.id) FROM 1 FOR 10)),
  'invoice_discount',
  'not_required',
  'active'
FROM customer_profiles cp
WHERE NOT EXISTS (
  SELECT 1
  FROM referral_parties rp
  WHERE rp.customer_id = cp.id
)
ON CONFLICT DO NOTHING;

UPDATE customer_referrals cr
SET
  referrer_party_id = rp.id,
  updated_at = NOW()
FROM referral_parties rp
WHERE cr.referrer_party_id IS NULL
  AND rp.customer_id = cr.referrer_customer_id;

UPDATE referral_submissions rs
SET referrer_party_id = rp.id
FROM referral_parties rp
WHERE rs.referrer_party_id IS NULL
  AND rp.customer_id = rs.referrer_customer_id;

WITH current_sequence AS (
  SELECT next_value
  FROM app_sequences
  WHERE sequence_name = 'referral'
),
numbered_referrals AS (
  SELECT
    cr.id,
    (current_sequence.next_value + ROW_NUMBER() OVER (ORDER BY cr.created_at ASC, cr.id ASC) - 1) AS sequence_number
  FROM customer_referrals cr
  CROSS JOIN current_sequence
  WHERE cr.referral_code IS NULL
)
UPDATE customer_referrals cr
SET
  referral_code = 'REF-' || EXTRACT(YEAR FROM NOW())::INT || '-' || LPAD(numbered_referrals.sequence_number::TEXT, 6, '0'),
  updated_at = NOW()
FROM numbered_referrals
WHERE cr.id = numbered_referrals.id;

WITH extracted_sequence AS (
  SELECT
    COALESCE(MAX((SUBSTRING(referral_code FROM '([0-9]+)$'))::BIGINT), 0) + 1 AS next_value
  FROM customer_referrals
  WHERE referral_code IS NOT NULL
)
INSERT INTO app_sequences (sequence_name, next_value)
SELECT 'referral', next_value
FROM extracted_sequence
ON CONFLICT (sequence_name) DO UPDATE
SET next_value = GREATEST(app_sequences.next_value, EXCLUDED.next_value);

WITH cutoff AS (
  SELECT (setting_json->>'cutoff')::TIMESTAMPTZ AS cutoff_at
  FROM system_settings
  WHERE setting_key = 'referral_party_backfill'
)
UPDATE customer_referrals cr
SET
  legitimacy_status = 'verified',
  legitimacy_reviewed_by = COALESCE(cr.legitimacy_reviewed_by, 'system'),
  legitimacy_reviewed_at = COALESCE(cr.legitimacy_reviewed_at, NOW()),
  legitimacy_notes = COALESCE(cr.legitimacy_notes, 'grandfathered on migration'),
  updated_at = NOW()
FROM cutoff
WHERE cr.created_at <= cutoff.cutoff_at
  AND cr.legitimacy_status = 'pending_review';

INSERT INTO referral_events (
  id,
  referral_id,
  referral_code,
  event_type,
  from_status,
  to_status,
  actor_username,
  actor_kind,
  detail,
  payload
)
SELECT
  'evt-backfill-intake-approved-' || cr.id,
  cr.id,
  cr.referral_code,
  'intake_approved',
  'pending_review',
  'verified',
  'system',
  'system',
  'Grandfathered on migration',
  jsonb_build_object('migration', '019_referral_program_rules_backfill')
FROM customer_referrals cr
JOIN system_settings ss ON ss.setting_key = 'referral_party_backfill'
WHERE cr.created_at <= (ss.setting_json->>'cutoff')::TIMESTAMPTZ
  AND cr.legitimacy_status = 'verified'
  AND NOT EXISTS (
    SELECT 1
    FROM referral_events re
    WHERE re.id = 'evt-backfill-intake-approved-' || cr.id
  )
ON CONFLICT DO NOTHING;

UPDATE customer_reward_ledger crl
SET
  delivery_method = 'invoice_discount',
  party_id = customer_referrals.referrer_party_id
FROM customer_referrals
WHERE crl.referral_id = customer_referrals.id
  AND crl.party_id IS NULL;
