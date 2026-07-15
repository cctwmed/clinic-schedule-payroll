-- 員工忘記打卡補登申請（由主管於後台打卡紀錄頁處理）
CREATE TYPE clock_correction_status AS ENUM ('pending', 'approved', 'rejected');

CREATE TABLE clock_correction_requests (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id       UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  employee_id     UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  line_user_id    TEXT,
  work_date       DATE NOT NULL,
  clock_type      clock_type NOT NULL,
  requested_time  TIME NOT NULL,
  reason          TEXT,
  status          clock_correction_status NOT NULL DEFAULT 'pending',
  reviewed_at     TIMESTAMPTZ,
  review_note     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_clock_correction_clinic_status
  ON clock_correction_requests(clinic_id, status, created_at DESC);

CREATE INDEX idx_clock_correction_employee
  ON clock_correction_requests(employee_id, work_date DESC);

CREATE TRIGGER trg_clock_correction_requests_updated
  BEFORE UPDATE ON clock_correction_requests
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE clock_correction_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY clock_correction_requests_all ON clock_correction_requests
  FOR ALL USING (true) WITH CHECK (true);
