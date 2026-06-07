INSERT INTO app_sequences (sequence_name, next_value)
VALUES ('employee', 1)
ON CONFLICT (sequence_name) DO NOTHING;

UPDATE app_sequences
SET next_value = GREATEST(
  next_value,
  COALESCE(
    (
      SELECT MAX((regexp_match(employee_code, '^EMP-2026-([0-9]+)$'))[1]::integer) + 1
      FROM employees
      WHERE employee_code ~ '^EMP-2026-[0-9]+$'
    ),
    1
  )
)
WHERE sequence_name = 'employee';
