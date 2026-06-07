CREATE OR REPLACE VIEW former_employees AS
SELECT *
FROM employees
WHERE status IN ('terminated', 'left_company');

CREATE TABLE IF NOT EXISTS employee_payslips (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  pay_period_label TEXT NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  payment_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  gross_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD',
  generated_by_username TEXT,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (employee_id, pay_period_label)
);

CREATE INDEX IF NOT EXISTS employee_payslips_employee_idx
  ON employee_payslips(employee_id, period_start DESC, period_end DESC);
