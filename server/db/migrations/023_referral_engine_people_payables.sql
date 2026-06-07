INSERT INTO app_sequences (sequence_name, next_value)
VALUES
  ('referral_intake', 1),
  ('employee', 1)
ON CONFLICT (sequence_name) DO NOTHING;

CREATE TABLE IF NOT EXISTS employees (
  id TEXT PRIMARY KEY,
  employee_code TEXT UNIQUE NOT NULL,
  first_name TEXT NOT NULL,
  middle_name TEXT,
  last_name TEXT NOT NULL,
  preferred_name TEXT,
  personal_email TEXT,
  normalized_personal_email TEXT,
  official_email TEXT,
  normalized_official_email TEXT,
  personal_mobile TEXT,
  personal_mobile_digits TEXT,
  official_mobile TEXT,
  official_mobile_digits TEXT,
  title TEXT NOT NULL,
  department TEXT NOT NULL,
  region TEXT NOT NULL,
  manager_name TEXT,
  status TEXT NOT NULL DEFAULT 'current'
    CHECK (status IN ('current', 'terminated', 'left_company', 'on_leave', 'contractor')),
  date_of_joining DATE NOT NULL,
  date_of_exit DATE,
  promotion_history JSONB NOT NULL DEFAULT '[]'::jsonb,
  hr_comments TEXT,
  one_time_joining_bonus NUMERIC(12, 2) NOT NULL DEFAULT 0,
  annual_bonus NUMERIC(12, 2) NOT NULL DEFAULT 0,
  monthly_salary NUMERIC(12, 2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD',
  critical_info JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS employees_status_idx ON employees(status, region, department);
CREATE INDEX IF NOT EXISTS employees_personal_email_idx ON employees(normalized_personal_email);
CREATE INDEX IF NOT EXISTS employees_official_email_idx ON employees(normalized_official_email);
CREATE INDEX IF NOT EXISTS employees_personal_mobile_idx ON employees(personal_mobile_digits);
CREATE INDEX IF NOT EXISTS employees_official_mobile_idx ON employees(official_mobile_digits);

CREATE TABLE IF NOT EXISTS employee_payments (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  payment_type TEXT NOT NULL
    CHECK (payment_type IN ('monthly_salary', 'joining_bonus', 'annual_bonus', 'referral_bonus', 'reimbursement', 'other')),
  amount NUMERIC(12, 2) NOT NULL CHECK (amount >= 0),
  currency TEXT NOT NULL DEFAULT 'USD',
  payment_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'paid' CHECK (status IN ('scheduled', 'paid', 'cancelled')),
  region TEXT,
  memo TEXT,
  reference TEXT,
  recorded_by_username TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS employee_payments_employee_idx ON employee_payments(employee_id, payment_date DESC);
CREATE INDEX IF NOT EXISTS employee_payments_status_idx ON employee_payments(status, payment_date DESC);
CREATE INDEX IF NOT EXISTS employee_payments_region_idx ON employee_payments(region, payment_date DESC);

CREATE TABLE IF NOT EXISTS other_expenses (
  id TEXT PRIMARY KEY,
  expense_code TEXT UNIQUE NOT NULL,
  expense_direction TEXT NOT NULL DEFAULT 'paid' CHECK (expense_direction IN ('paid', 'received')),
  category TEXT NOT NULL,
  vendor_or_source TEXT NOT NULL,
  amount NUMERIC(12, 2) NOT NULL CHECK (amount >= 0),
  currency TEXT NOT NULL DEFAULT 'USD',
  expense_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'paid' CHECK (status IN ('planned', 'submitted', 'approved', 'paid', 'received', 'cancelled')),
  region TEXT,
  department TEXT,
  payment_method TEXT,
  memo TEXT,
  receipt_reference TEXT,
  recorded_by_username TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS other_expenses_direction_idx ON other_expenses(expense_direction, status, expense_date DESC);
CREATE INDEX IF NOT EXISTS other_expenses_category_idx ON other_expenses(category, expense_date DESC);
CREATE INDEX IF NOT EXISTS other_expenses_region_idx ON other_expenses(region, expense_date DESC);

CREATE TABLE IF NOT EXISTS referral_intake (
  id TEXT PRIMARY KEY,
  ref_code TEXT UNIQUE NOT NULL,
  referrer_resolution TEXT NOT NULL CHECK (referrer_resolution IN ('auto', 'self_declared')),
  referrer_kind TEXT NOT NULL CHECK (referrer_kind IN ('customer', 'employee', 'unverified')),
  referrer_party_type TEXT,
  referrer_party_id TEXT,
  referrer_name TEXT,
  referrer_contact_method TEXT NOT NULL CHECK (referrer_contact_method IN ('email', 'phone', 'employee_id', 'self')),
  referrer_email TEXT,
  referrer_phone TEXT,
  referrer_employee_id TEXT,
  consent_identity_at TIMESTAMPTZ,
  client_name TEXT NOT NULL,
  client_email_norm TEXT,
  client_phone_norm TEXT,
  client_email_raw TEXT,
  client_phone_raw TEXT,
  relationship TEXT,
  reward_type TEXT NOT NULL DEFAULT 'tbd' CHECK (reward_type IN ('invoice_discount', 'cash_bonus', 'tbd')),
  reward_estimate NUMERIC(12, 2),
  reward_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  duplicate_of_intake_id TEXT REFERENCES referral_intake(id) ON DELETE SET NULL,
  duplicate_reason TEXT,
  agreement_terms_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending_review'
    CHECK (status IN ('pending_identity', 'pending_review', 'verified', 'qualified', 'rewarded', 'rejected', 'duplicate')),
  source TEXT DEFAULT 'portal',
  ip_hash TEXT,
  user_agent_hash TEXT,
  reviewed_by_username TEXT,
  reviewed_at TIMESTAMPTZ,
  review_notes TEXT,
  resolved_referrer_party_type TEXT,
  resolved_referrer_party_id TEXT,
  created_referral_id TEXT REFERENCES customer_referrals(id) ON DELETE SET NULL,
  created_payout_id TEXT REFERENCES referral_payouts(id) ON DELETE SET NULL,
  created_reward_id TEXT REFERENCES customer_reward_ledger(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT referral_intake_client_contact_present
    CHECK (client_email_norm IS NOT NULL OR client_phone_norm IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS referral_intake_status_idx ON referral_intake(status, created_at DESC);
CREATE INDEX IF NOT EXISTS referral_intake_referrer_idx ON referral_intake(referrer_kind, referrer_party_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS referral_intake_email_unique ON referral_intake(client_email_norm)
  WHERE client_email_norm IS NOT NULL AND status NOT IN ('rejected', 'duplicate');
CREATE UNIQUE INDEX IF NOT EXISTS referral_intake_phone_unique ON referral_intake(client_phone_norm)
  WHERE client_phone_norm IS NOT NULL AND status NOT IN ('rejected', 'duplicate');

CREATE TABLE IF NOT EXISTS referral_intake_services (
  id TEXT PRIMARY KEY,
  intake_id TEXT NOT NULL REFERENCES referral_intake(id) ON DELETE CASCADE,
  service_key TEXT NOT NULL,
  service_label TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (intake_id, service_key)
);

CREATE INDEX IF NOT EXISTS referral_intake_services_intake_idx ON referral_intake_services(intake_id);

CREATE TABLE IF NOT EXISTS referral_intake_events (
  id TEXT PRIMARY KEY,
  intake_id TEXT NOT NULL REFERENCES referral_intake(id) ON DELETE CASCADE,
  ref_code TEXT,
  event_type TEXT NOT NULL,
  from_status TEXT,
  to_status TEXT,
  actor_username TEXT,
  actor_kind TEXT NOT NULL DEFAULT 'system',
  detail TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS referral_intake_events_intake_idx ON referral_intake_events(intake_id, created_at DESC);

INSERT INTO employees (
  id, employee_code, first_name, middle_name, last_name, preferred_name,
  personal_email, normalized_personal_email, official_email, normalized_official_email,
  personal_mobile, personal_mobile_digits, official_mobile, official_mobile_digits,
  title, department, region, manager_name, status, date_of_joining,
  promotion_history, hr_comments, one_time_joining_bonus, annual_bonus, monthly_salary, critical_info
) VALUES
  (
    'employee-aanya-rao', 'EMP-2026-000001', 'Aanya', NULL, 'Rao', 'Aanya',
    'aanya.personal@example.com', 'aanya.personal@example.com', 'aanya@ascendhsi.com', 'aanya@ascendhsi.com',
    '+1 555 0101', '15550101', '+1 555 1101', '15551101',
    'Sales Representative', 'Sales', 'US', 'Rohan Khanna', 'current', '2026-01-15',
    '[{"date":"2026-01-15","title":"Sales Representative","note":"Joined US sales desk"}]'::jsonb,
    'Eligible for employee referral payouts through payroll after finance approval.', 1500, 5000, 6200,
    '{"employmentType":"full_time","payrollState":"active","visaSupport":false}'::jsonb
  ),
  (
    'employee-rohan-khanna', 'EMP-2026-000002', 'Rohan', NULL, 'Khanna', 'Rohan',
    'rohan.personal@example.com', 'rohan.personal@example.com', 'rohan@ascendhsi.com', 'rohan@ascendhsi.com',
    '+1 555 0102', '15550102', '+1 555 1102', '15551102',
    'Sales Team Lead', 'Sales', 'US', 'Executive Team', 'current', '2025-11-01',
    '[{"date":"2025-11-01","title":"Sales Team Lead","note":"Joined as sales lead"}]'::jsonb,
    'Manages US referral campaigns and special bonus programs.', 2500, 8000, 8400,
    '{"employmentType":"full_time","payrollState":"active","managerApprovalRequired":true}'::jsonb
  ),
  (
    'employee-tunde-adebayo', 'EMP-2026-000004', 'Tunde', NULL, 'Adebayo', 'Tunde',
    'tunde.personal@example.com', 'tunde.personal@example.com', 'tunde@ascendhsi.com', 'tunde@ascendhsi.com',
    '+234 555 0103', '2345550103', '+234 555 1103', '2345551103',
    'Attorney', 'Legal', 'Nigeria', 'Legal Director', 'current', '2026-02-10',
    '[{"date":"2026-02-10","title":"Attorney","note":"Joined legal services team"}]'::jsonb,
    'Regional legal support. Bonus payouts reviewed by HR and Finance.', 1000, 4000, 5200,
    '{"employmentType":"contractor","payrollState":"vendor_pay","barStatus":"verified"}'::jsonb
  )
ON CONFLICT (employee_code) DO NOTHING;

INSERT INTO employee_payments (
  id, employee_id, payment_type, amount, payment_date, status, region, memo, reference, recorded_by_username
) VALUES
  ('emp-pay-aanya-2026-05-salary', 'employee-aanya-rao', 'monthly_salary', 6200, '2026-05-31', 'paid', 'US', 'May salary', 'PAY-US-2026-05-001', 'seed'),
  ('emp-pay-aanya-join', 'employee-aanya-rao', 'joining_bonus', 1500, '2026-01-31', 'paid', 'US', 'Joining bonus', 'PAY-US-2026-01-010', 'seed'),
  ('emp-pay-rohan-2026-05-salary', 'employee-rohan-khanna', 'monthly_salary', 8400, '2026-05-31', 'paid', 'US', 'May salary', 'PAY-US-2026-05-002', 'seed'),
  ('emp-pay-tunde-2026-05-salary', 'employee-tunde-adebayo', 'monthly_salary', 5200, '2026-05-31', 'paid', 'Nigeria', 'May contractor pay', 'PAY-NG-2026-05-001', 'seed')
ON CONFLICT (id) DO NOTHING;

INSERT INTO other_expenses (
  id, expense_code, expense_direction, category, vendor_or_source, amount, expense_date,
  status, region, department, payment_method, memo, receipt_reference, recorded_by_username
) VALUES
  ('other-exp-laptops-2026-05', 'EXP-2026-000001', 'paid', 'Equipment - laptops', 'Apple Business', 4800, '2026-05-20', 'paid', 'US', 'Operations', 'card', 'MacBook purchases for new sales hires', 'REC-LAP-2026-05', 'seed'),
  ('other-exp-rent-2026-06', 'EXP-2026-000002', 'paid', 'Facility rent / lease', 'Austin Office Lease', 3200, '2026-06-01', 'paid', 'US', 'Operations', 'ach', 'June shared office rent', 'REC-RENT-2026-06', 'seed'),
  ('other-exp-refund-2026-06', 'EXP-2026-000003', 'received', 'Vendor refund', 'Equipment vendor refund', 250, '2026-06-03', 'received', 'US', 'Operations', 'ach', 'Partial accessory refund received', 'REC-REFUND-2026-06', 'seed')
ON CONFLICT (expense_code) DO NOTHING;

INSERT INTO referral_parties (
  id, party_type, display_name, email, phone_digits, referral_code, payout_method, payout_handle, tax_status, status
) VALUES
  ('party-employee-aanya-rao', 'employee', 'Aanya Rao', 'aanya@ascendhsi.com', '15551101', 'PTY-EMP-000001', 'payroll', 'EMP-2026-000001', 'collected', 'active'),
  ('party-employee-rohan-khanna', 'employee', 'Rohan Khanna', 'rohan@ascendhsi.com', '15551102', 'PTY-EMP-000002', 'payroll', 'EMP-2026-000002', 'collected', 'active'),
  ('party-employee-tunde-adebayo', 'employee', 'Tunde Adebayo', 'tunde@ascendhsi.com', '2345551103', 'PTY-EMP-000004', 'payroll', 'EMP-2026-000004', 'collected', 'active')
ON CONFLICT (id) DO NOTHING;
