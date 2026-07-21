-- 加班申請（臨時加班／支援）
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'overtime_request_status') THEN
    CREATE TYPE overtime_request_status AS ENUM ('pending', 'approved', 'rejected');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS overtime_requests (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id         UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  employee_id       UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  line_user_id      TEXT,
  work_date         DATE NOT NULL,
  start_time        TIME NOT NULL,
  end_time          TIME NOT NULL,
  duration_minutes  INTEGER NOT NULL CHECK (duration_minutes > 0),
  reason            TEXT,
  status            overtime_request_status NOT NULL DEFAULT 'pending',
  reviewed_by       UUID REFERENCES employees(id),
  reviewed_at       TIMESTAMPTZ,
  review_note       TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_overtime_requests_clinic_status
  ON overtime_requests(clinic_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_overtime_requests_employee
  ON overtime_requests(employee_id, work_date DESC);

DROP TRIGGER IF EXISTS trg_overtime_requests_updated ON overtime_requests;
CREATE TRIGGER trg_overtime_requests_updated
  BEFORE UPDATE ON overtime_requests
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE overtime_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS overtime_requests_all ON overtime_requests;
CREATE POLICY overtime_requests_all ON overtime_requests FOR ALL USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
