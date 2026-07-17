-- ============================================================
-- 018 / 一鍵修復：補齊雲端漏跑的 schema（可重複執行）
-- 請在 Supabase → SQL Editor 整段貼上 → Run
-- ============================================================

-- ---------- 008：特休到職日 + annual_leave_records ----------
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS arrival_date DATE;

UPDATE employees
SET arrival_date = hire_date
WHERE arrival_date IS NULL AND hire_date IS NOT NULL;

CREATE TABLE IF NOT EXISTS annual_leave_records (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id           UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  period_start          DATE NOT NULL,
  period_end            DATE NOT NULL,
  expiry_date           DATE NOT NULL,
  total_days            NUMERIC(4, 1) NOT NULL,
  used_days             NUMERIC(4, 1) NOT NULL DEFAULT 0,
  payout_days           NUMERIC(4, 1),
  payout_amount         NUMERIC(12, 2),
  payout_payroll_run_id UUID REFERENCES payroll_runs(id),
  settled_at            TIMESTAMPTZ,
  note                  TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (employee_id, period_start)
);

CREATE INDEX IF NOT EXISTS idx_annual_leave_employee ON annual_leave_records(employee_id);
CREATE INDEX IF NOT EXISTS idx_annual_leave_expiry ON annual_leave_records(expiry_date);

-- ---------- 013：診所管理員 ----------
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS is_clinic_admin BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_employees_clinic_admin
  ON employees(clinic_id, is_clinic_admin)
  WHERE is_clinic_admin = true;

-- ---------- 014：五大假別額度欄位（leave_records 表若已存在則略過建立）----------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'leave_record_type') THEN
    CREATE TYPE leave_record_type AS ENUM (
      'special', 'marriage', 'bereavement', 'sick', 'personal'
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'leave_record_status') THEN
    CREATE TYPE leave_record_status AS ENUM ('pending', 'approved', 'rejected');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS leave_records (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id     UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  employee_id   UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  leave_type    leave_record_type NOT NULL,
  work_date     DATE NOT NULL,
  start_time    TIMESTAMPTZ NOT NULL,
  end_time      TIMESTAMPTZ NOT NULL,
  total_hours   NUMERIC(6, 2) NOT NULL DEFAULT 0,
  status        leave_record_status NOT NULL DEFAULT 'pending',
  reason        TEXT,
  reviewed_by   TEXT,
  reviewed_at   TIMESTAMPTZ,
  review_note   TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS special_leave_balance NUMERIC(8, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sick_leave_used_this_year NUMERIC(8, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS personal_leave_used_this_year NUMERIC(8, 2) NOT NULL DEFAULT 0;

-- ---------- 010：雇主負擔（若尚未加）----------
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS labor_insurance_employer_pay NUMERIC(10, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS health_insurance_employer_pay NUMERIC(10, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS labor_pension_employer_pay NUMERIC(10, 2) NOT NULL DEFAULT 0;

-- ---------- 017：年齡／健保（若尚未加）----------
ALTER TABLE employees ADD COLUMN IF NOT EXISTS birth_date DATE;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS national_id TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS health_insurance_enrollment TEXT NOT NULL DEFAULT 'clinic';
ALTER TABLE employees ADD COLUMN IF NOT EXISTS is_related_to_owner BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS is_child_laborer BOOLEAN NOT NULL DEFAULT false;

-- ---------- RLS：與 016 一致（authenticated 可讀寫；service_role 本來就略過 RLS）----------
DO $$
DECLARE
  t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'clinics',
    'employees',
    'employee_line_bindings',
    'shift_types',
    'schedules',
    'shift_assignments',
    'shift_swap_requests',
    'clock_records',
    'clock_correction_requests',
    'payroll_settings',
    'payroll_allowances',
    'payroll_runs',
    'payroll_items',
    'compliance_alerts',
    'notifications',
    'leave_records',
    'annual_leave_balances',
    'annual_leave_records'
  ])
  LOOP
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = t) THEN
      EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
      EXECUTE format('DROP POLICY IF EXISTS allow_anon_all ON %I', t);
      EXECUTE format('DROP POLICY IF EXISTS allow_authenticated_all ON %I', t);
      EXECUTE format('DROP POLICY IF EXISTS authenticated_all ON %I', t);
      EXECUTE format('DROP POLICY IF EXISTS leave_records_all ON %I', t);
      EXECUTE format(
        'CREATE POLICY authenticated_all ON %I FOR ALL TO authenticated USING (true) WITH CHECK (true)',
        t
      );
    END IF;
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';

-- ---------- 012：提早打卡對齊欄位 ----------
ALTER TABLE clock_records
  ADD COLUMN IF NOT EXISTS is_early BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS early_minutes INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payable_clocked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS is_early_abnormal BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS early_work_approved BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS early_reviewed_by TEXT,
  ADD COLUMN IF NOT EXISTS early_reviewed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_clock_early_abnormal
  ON clock_records(is_early_abnormal)
  WHERE is_early_abnormal = true AND clock_type = 'clock_in';

NOTIFY pgrst, 'reload schema';

-- ---------- 019：產假／安胎假 ----------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'leave_record_type' AND e.enumlabel = 'maternity'
  ) THEN
    ALTER TYPE leave_record_type ADD VALUE 'maternity';
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'leave_record_type' AND e.enumlabel = 'pregnancy_rest'
  ) THEN
    ALTER TYPE leave_record_type ADD VALUE 'pregnancy_rest';
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

NOTIFY pgrst, 'reload schema';
