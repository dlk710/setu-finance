UPDATE employees
SET currency = CASE region
  WHEN 'India' THEN 'INR'
  WHEN 'Nigeria' THEN 'NGN'
  ELSE 'USD'
END
WHERE region IN ('US', 'India', 'Nigeria')
  AND currency <> CASE region
    WHEN 'India' THEN 'INR'
    WHEN 'Nigeria' THEN 'NGN'
    ELSE 'USD'
  END;

UPDATE employee_payments payments
SET currency = employees.currency
FROM employees
WHERE payments.employee_id = employees.id
  AND payments.currency <> employees.currency;
