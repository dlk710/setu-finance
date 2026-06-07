UPDATE employees
SET department = 'Attorney'
WHERE department = 'Legal';

UPDATE employees
SET title = CASE
  WHEN title = 'Sales Representative' THEN 'Consultant'
  WHEN title = 'Sales Team Lead' THEN 'Team Lead'
  WHEN title = 'Referral Ops Analyst' THEN 'Consultant'
  ELSE title
END
WHERE title IN ('Sales Representative', 'Sales Team Lead', 'Referral Ops Analyst');
