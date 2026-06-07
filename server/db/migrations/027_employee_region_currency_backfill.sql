UPDATE employees
SET currency = CASE region
  WHEN 'India' THEN 'INR'
  WHEN 'Nigeria' THEN 'NGN'
  ELSE 'USD'
END
WHERE currency IS NULL
   OR currency = 'USD'
   OR currency NOT IN ('USD', 'INR', 'NGN');

UPDATE employee_payments payments
SET currency = employees.currency
FROM employees
WHERE payments.employee_id = employees.id
  AND (payments.currency IS NULL OR payments.currency <> employees.currency);
