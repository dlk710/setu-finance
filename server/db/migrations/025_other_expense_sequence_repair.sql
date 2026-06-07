INSERT INTO app_sequences (sequence_name, next_value)
VALUES ('other_expense', 1)
ON CONFLICT (sequence_name) DO NOTHING;

UPDATE app_sequences
SET next_value = GREATEST(
  next_value,
  COALESCE(
    (
      SELECT MAX((regexp_match(expense_code, '^EXP-2026-([0-9]+)$'))[1]::integer) + 1
      FROM other_expenses
      WHERE expense_code ~ '^EXP-2026-[0-9]+$'
    ),
    1
  )
)
WHERE sequence_name = 'other_expense';
