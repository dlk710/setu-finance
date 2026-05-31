UPDATE customer_referrals
SET referred_on = COALESCE(referred_on, created_at)
WHERE referred_on IS NULL;

UPDATE customer_referrals
SET relationship_label = CASE
  WHEN relationship_label IS NOT NULL THEN relationship_label
  WHEN LOWER(COALESCE(notes, '')) LIKE '%family%' THEN 'Family'
  WHEN LOWER(COALESCE(notes, '')) LIKE '%friend%' THEN 'Friend'
  WHEN LOWER(COALESCE(notes, '')) LIKE '%colleague%' THEN 'Colleague'
  WHEN LOWER(COALESCE(notes, '')) LIKE '%community%' THEN 'Community'
  WHEN LOWER(COALESCE(notes, '')) LIKE '%former client%' THEN 'Former client'
  ELSE relationship_label
END
WHERE relationship_label IS NULL;

UPDATE customer_reward_ledger
SET applied_by_username = COALESCE(applied_by_username, 'legacy')
WHERE status = 'applied'
  AND applied_at IS NOT NULL
  AND applied_by_username IS NULL;
