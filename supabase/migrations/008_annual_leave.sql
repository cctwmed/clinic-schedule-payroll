-- 勞基法第 38 條：特別休假（特休）週年制

ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS arrival_date DATE;

UPDATE employees
SET arrival_date = hire_date
WHERE arrival_date IS NULL AND hire_date IS NOT NULL;

COMMENT ON COLUMN employees.arrival_date IS '到職日（特休週年制起算日，通常同 hire_date）';

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

-- RLS
ALTER TABLE annual_leave_records ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS allow_anon_all ON annual_leave_records;
CREATE POLICY allow_anon_all ON annual_leave_records
  FOR ALL TO anon USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS allow_authenticated_all ON annual_leave_records;
CREATE POLICY allow_authenticated_all ON annual_leave_records
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
