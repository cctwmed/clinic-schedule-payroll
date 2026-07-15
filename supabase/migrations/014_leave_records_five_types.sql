-- 五大假別請假紀錄與員工年度額度欄位

CREATE TYPE leave_record_type AS ENUM (
  'special',
  'marriage',
  'bereavement',
  'sick',
  'personal'
);

CREATE TYPE leave_record_status AS ENUM ('pending', 'approved', 'rejected');

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

CREATE INDEX IF NOT EXISTS idx_leave_records_clinic_status
  ON leave_records(clinic_id, status, work_date DESC);

CREATE INDEX IF NOT EXISTS idx_leave_records_employee_date
  ON leave_records(employee_id, work_date DESC);

CREATE INDEX IF NOT EXISTS idx_leave_records_payroll
  ON leave_records(employee_id, status, work_date)
  WHERE status = 'approved';

CREATE TRIGGER trg_leave_records_updated
  BEFORE UPDATE ON leave_records
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS special_leave_balance NUMERIC(8, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sick_leave_used_this_year NUMERIC(8, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS personal_leave_used_this_year NUMERIC(8, 2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN employees.special_leave_balance IS '剩餘特休時數（由 annual_leave 同步或手動維護）';
COMMENT ON COLUMN employees.sick_leave_used_this_year IS '今年已核准病假時數';
COMMENT ON COLUMN employees.personal_leave_used_this_year IS '今年已核准事假時數';

ALTER TABLE leave_records ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS leave_records_all ON leave_records;
CREATE POLICY leave_records_all ON leave_records
  FOR ALL USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
