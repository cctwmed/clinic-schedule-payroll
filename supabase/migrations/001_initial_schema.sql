-- ============================================================
-- 小型醫療診所排班支薪系統 — 初始資料庫 Schema
-- PostgreSQL / Supabase
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "btree_gist";

-- ============================================================
-- 1. 診所
-- ============================================================

CREATE TABLE clinics (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  address       TEXT,
  phone         TEXT,
  timezone      TEXT NOT NULL DEFAULT 'Asia/Taipei',
  latitude      NUMERIC(10, 7),   -- 診所 GPS（打卡比對基準點）
  longitude     NUMERIC(10, 7),
  geo_radius_m  INTEGER NOT NULL DEFAULT 200,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 2. 員工（含時薪、勞健保自付額）
-- ============================================================

CREATE TYPE employee_role AS ENUM ('nurse', 'admin', 'doctor', 'staff');
CREATE TYPE employment_type AS ENUM ('full_time', 'part_time', 'contract');
CREATE TYPE employee_status AS ENUM ('active', 'inactive', 'resigned');

CREATE TABLE employees (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id                   UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  employee_no                 TEXT NOT NULL,
  name                        TEXT NOT NULL,
  role                        employee_role NOT NULL DEFAULT 'nurse',
  employment_type             employment_type NOT NULL DEFAULT 'full_time',
  status                      employee_status NOT NULL DEFAULT 'active',
  email                       TEXT,
  phone                       TEXT,
  hire_date                   DATE NOT NULL,
  resign_date                 DATE,
  -- 薪資與保險（員工層級預設值，詳細設定見 payroll_settings）
  hourly_wage                 NUMERIC(10, 2) NOT NULL DEFAULT 0,  -- 每小時基本薪資
  labor_insurance_self_pay    NUMERIC(10, 2) NOT NULL DEFAULT 0,  -- 勞保自付額
  health_insurance_self_pay   NUMERIC(10, 2) NOT NULL DEFAULT 0,  -- 健保自付額
  -- 勞基法
  weekly_rest_day             SMALLINT NOT NULL DEFAULT 0,
  daily_work_hours            NUMERIC(4, 2) NOT NULL DEFAULT 8.00,
  auth_user_id                UUID UNIQUE,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (clinic_id, employee_no)
);

CREATE INDEX idx_employees_clinic ON employees(clinic_id);
CREATE INDEX idx_employees_status ON employees(status);

-- ============================================================
-- 3. LINE 綁定
-- ============================================================

CREATE TABLE employee_line_bindings (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id     UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  line_user_id    TEXT NOT NULL UNIQUE,
  display_name    TEXT,
  picture_url     TEXT,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  bound_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  unbound_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_line_bindings_employee ON employee_line_bindings(employee_id);

-- ============================================================
-- 4. 班別定義（早診、午診、晚診、休診）
-- ============================================================

CREATE TYPE shift_category AS ENUM (
  'morning',    -- 早診
  'afternoon',  -- 午診
  'evening',    -- 晚診
  'closed',     -- 休診
  'custom'
);

CREATE TABLE shift_types (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id             UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  code                  TEXT NOT NULL,
  name                  TEXT NOT NULL,
  category              shift_category NOT NULL,
  default_clock_in      TIME,              -- 預設上班時間
  default_clock_out     TIME,              -- 預設下班時間
  break_minutes         INTEGER NOT NULL DEFAULT 0,
  planned_hours         NUMERIC(4, 2),
  color_hex             TEXT DEFAULT '#3B82F6',
  is_active             BOOLEAN NOT NULL DEFAULT true,
  sort_order            INTEGER NOT NULL DEFAULT 0,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (clinic_id, code)
);

-- ============================================================
-- 5. 排班（班表）
-- ============================================================

CREATE TYPE schedule_status AS ENUM ('draft', 'published', 'archived');
CREATE TYPE assignment_status AS ENUM ('scheduled', 'confirmed', 'cancelled');

CREATE TABLE schedules (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id     UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  year          SMALLINT NOT NULL,
  month         SMALLINT NOT NULL CHECK (month BETWEEN 1 AND 12),
  status        schedule_status NOT NULL DEFAULT 'draft',
  published_at  TIMESTAMPTZ,
  published_by  UUID REFERENCES employees(id),
  note          TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (clinic_id, year, month)
);

CREATE TABLE shift_assignments (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id           UUID NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
  employee_id           UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  shift_type_id         UUID NOT NULL REFERENCES shift_types(id),
  work_date             DATE NOT NULL,
  status                assignment_status NOT NULL DEFAULT 'scheduled',
  expected_clock_in     TIME NOT NULL,     -- 預計上班時間
  expected_clock_out    TIME NOT NULL,     -- 預計下班時間
  note                  TEXT,
  compliance_checked_at TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (employee_id, work_date, shift_type_id)
);

CREATE INDEX idx_assignments_schedule ON shift_assignments(schedule_id);
CREATE INDEX idx_assignments_employee_date ON shift_assignments(employee_id, work_date);
CREATE INDEX idx_assignments_date ON shift_assignments(work_date);

-- ============================================================
-- 6. 換班申請
-- ============================================================

CREATE TYPE swap_request_status AS ENUM (
  'pending', 'approved', 'rejected', 'cancelled'
);

CREATE TABLE shift_swap_requests (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id              UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  requester_id           UUID NOT NULL REFERENCES employees(id),
  target_employee_id     UUID REFERENCES employees(id),
  original_assignment_id UUID NOT NULL REFERENCES shift_assignments(id),
  proposed_assignment_id UUID REFERENCES shift_assignments(id),
  status                 swap_request_status NOT NULL DEFAULT 'pending',
  reason                 TEXT,
  reviewed_by            UUID REFERENCES employees(id),
  reviewed_at            TIMESTAMPTZ,
  review_note            TEXT,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 7. 打卡紀錄（含 GPS 經緯度）
-- ============================================================

-- timestamptz::date 受 Session 時區影響，無法直接用於索引；
-- 改用固定 Asia/Taipei 的 IMMUTABLE 函式。
CREATE OR REPLACE FUNCTION date_in_taipei(ts timestamptz)
RETURNS date
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public
AS $$
  SELECT (ts AT TIME ZONE 'Asia/Taipei')::date;
$$;

CREATE TYPE clock_type AS ENUM ('clock_in', 'clock_out', 'break_start', 'break_end');
CREATE TYPE clock_source AS ENUM ('line_liff', 'line_rich_menu', 'admin_manual', 'system_auto');
CREATE TYPE clock_validation AS ENUM ('valid', 'invalid_location', 'invalid_time', 'manual_override');

CREATE TABLE clock_records (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id            UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  assignment_id          UUID REFERENCES shift_assignments(id),
  clock_type             clock_type NOT NULL,
  clocked_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  clock_date             DATE GENERATED ALWAYS AS (date_in_taipei(clocked_at)) STORED,
  -- GPS 經緯度（Latitude / Longitude）
  latitude               NUMERIC(10, 7),
  longitude              NUMERIC(10, 7),
  geo_accuracy_m         NUMERIC(8, 2),
  distance_from_clinic_m NUMERIC(8, 2),
  validation             clock_validation NOT NULL DEFAULT 'valid',
  source                 clock_source NOT NULL DEFAULT 'line_liff',
  device_info            JSONB,
  raw_payload            JSONB,
  note                   TEXT,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_clock_employee_time ON clock_records(employee_id, clocked_at DESC);
CREATE INDEX idx_clock_assignment ON clock_records(assignment_id);
CREATE INDEX idx_clock_date ON clock_records(clock_date);

-- ============================================================
-- 8. 薪資設定
-- ============================================================

CREATE TYPE salary_type AS ENUM ('monthly', 'hourly');
CREATE TYPE allowance_type AS ENUM (
  'clinic_fee', 'full_attendance', 'night_shift', 'holiday', 'meal', 'transport', 'custom'
);

CREATE TABLE payroll_settings (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id             UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  effective_from          DATE NOT NULL,
  effective_to            DATE,
  salary_type             salary_type NOT NULL DEFAULT 'hourly',
  base_salary             NUMERIC(12, 2) NOT NULL,
  hourly_rate             NUMERIC(10, 2),
  ot_rate_weekday         NUMERIC(4, 2) NOT NULL DEFAULT 1.34,
  ot_rate_weekday_2h      NUMERIC(4, 2) NOT NULL DEFAULT 1.67,
  ot_rate_rest_day        NUMERIC(4, 2) NOT NULL DEFAULT 1.34,
  ot_rate_holiday         NUMERIC(4, 2) NOT NULL DEFAULT 2.00,
  full_attendance_bonus   NUMERIC(10, 2) DEFAULT 0,
  full_attendance_min_days INTEGER DEFAULT 22,
  labor_insurance_self_pay  NUMERIC(10, 2) DEFAULT 0,
  health_insurance_self_pay NUMERIC(10, 2) DEFAULT 0,
  note                    TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_payroll_settings_employee ON payroll_settings(employee_id, effective_from DESC);

CREATE TABLE payroll_allowances (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payroll_setting_id UUID NOT NULL REFERENCES payroll_settings(id) ON DELETE CASCADE,
  allowance_type     allowance_type NOT NULL,
  name               TEXT NOT NULL,
  amount             NUMERIC(10, 2) NOT NULL,
  is_fixed           BOOLEAN NOT NULL DEFAULT true,
  condition_json     JSONB,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 9. 薪資結算
-- ============================================================

CREATE TYPE payroll_run_status AS ENUM ('draft', 'calculated', 'approved', 'paid');

CREATE TABLE payroll_runs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id     UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  year          SMALLINT NOT NULL,
  month         SMALLINT NOT NULL CHECK (month BETWEEN 1 AND 12),
  period_start  DATE NOT NULL,
  period_end    DATE NOT NULL,
  status        payroll_run_status NOT NULL DEFAULT 'draft',
  calculated_at TIMESTAMPTZ,
  approved_by   UUID REFERENCES employees(id),
  approved_at   TIMESTAMPTZ,
  note          TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (clinic_id, year, month)
);

CREATE TABLE payroll_items (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payroll_run_id       UUID NOT NULL REFERENCES payroll_runs(id) ON DELETE CASCADE,
  employee_id          UUID NOT NULL REFERENCES employees(id),
  regular_hours        NUMERIC(8, 2) NOT NULL DEFAULT 0,
  overtime_hours       NUMERIC(8, 2) NOT NULL DEFAULT 0,
  overtime_hours_2tier NUMERIC(8, 2) NOT NULL DEFAULT 0,
  rest_day_hours       NUMERIC(8, 2) NOT NULL DEFAULT 0,
  holiday_hours        NUMERIC(8, 2) NOT NULL DEFAULT 0,
  absent_days          NUMERIC(4, 1) NOT NULL DEFAULT 0,
  late_count           INTEGER NOT NULL DEFAULT 0,
  base_pay             NUMERIC(12, 2) NOT NULL DEFAULT 0,
  overtime_pay         NUMERIC(12, 2) NOT NULL DEFAULT 0,
  allowance_total      NUMERIC(12, 2) NOT NULL DEFAULT 0,
  deduction_total      NUMERIC(12, 2) NOT NULL DEFAULT 0,
  gross_pay            NUMERIC(12, 2) NOT NULL DEFAULT 0,
  net_pay              NUMERIC(12, 2) NOT NULL DEFAULT 0,
  breakdown            JSONB NOT NULL DEFAULT '{}',
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (payroll_run_id, employee_id)
);

-- ============================================================
-- 10. 勞基法合規規則與預警紀錄
-- ============================================================

CREATE TYPE compliance_severity AS ENUM ('info', 'warning', 'violation');
CREATE TYPE compliance_status AS ENUM ('open', 'acknowledged', 'resolved', 'dismissed');

CREATE TABLE compliance_rules (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id       UUID REFERENCES clinics(id) ON DELETE CASCADE,
  rule_code       TEXT NOT NULL,
  name            TEXT NOT NULL,
  description     TEXT,
  threshold_value NUMERIC(10, 2),
  threshold_unit  TEXT,
  severity        compliance_severity NOT NULL DEFAULT 'warning',
  legal_reference TEXT,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (clinic_id, rule_code)
);

-- 勞基法預警結果（例如：某員工某天加班超時）
CREATE TABLE compliance_alerts (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id         UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  rule_id           UUID NOT NULL REFERENCES compliance_rules(id),
  employee_id       UUID REFERENCES employees(id),
  assignment_id     UUID REFERENCES shift_assignments(id),
  clock_record_id   UUID REFERENCES clock_records(id),
  alert_date        DATE NOT NULL,
  severity          compliance_severity NOT NULL,
  status            compliance_status NOT NULL DEFAULT 'open',
  rule_code         TEXT NOT NULL,
  message           TEXT NOT NULL,
  actual_value      NUMERIC(10, 2),
  threshold_value   NUMERIC(10, 2),
  unit              TEXT,
  details           JSONB,
  notified_at       TIMESTAMPTZ,
  notified_via      TEXT[],
  acknowledged_by   UUID REFERENCES employees(id),
  acknowledged_at   TIMESTAMPTZ,
  resolved_at       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_compliance_alerts_clinic ON compliance_alerts(clinic_id, status, alert_date);
CREATE INDEX idx_compliance_alerts_employee ON compliance_alerts(employee_id, alert_date);

-- ============================================================
-- 11. LINE 通知
-- ============================================================

CREATE TYPE notification_type AS ENUM (
  'schedule_published', 'shift_reminder', 'clock_success', 'clock_anomaly',
  'compliance_alert', 'swap_request', 'swap_result', 'payroll_ready'
);

CREATE TABLE notifications (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id     UUID REFERENCES employees(id),
  clinic_id       UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  type            notification_type NOT NULL,
  title           TEXT NOT NULL,
  body            TEXT NOT NULL,
  payload         JSONB,
  line_message_id TEXT,
  sent_at         TIMESTAMPTZ,
  read_at         TIMESTAMPTZ,
  failed_at       TIMESTAMPTZ,
  error_message   TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 12. 勞基法預設規則
-- ============================================================

INSERT INTO compliance_rules (clinic_id, rule_code, name, description, threshold_value, threshold_unit, severity, legal_reference) VALUES
  (NULL, 'MAX_DAILY_HOURS',      '單日工時上限',   '單日正常工時不得超過 8 小時',              8,    'hours',   'violation', '勞基法第 30 條'),
  (NULL, 'MAX_WEEKLY_HOURS',     '每週工時上限',   '每週工時不得超過 40 小時',                40,   'hours',   'violation', '勞基法第 30 條'),
  (NULL, 'MAX_OT_DAILY',         '單日加班上限',   '單日延長工時不得超過 4 小時',              4,    'hours',   'violation', '勞基法第 32 條'),
  (NULL, 'MAX_OT_MONTHLY',       '每月加班上限',   '每月延長工時不得超過 46 小時',            46,   'hours',   'violation', '勞基法第 32 條'),
  (NULL, 'MIN_REST_BETWEEN',     '班次間休息',     '兩班間至少休息 11 小時',                 11,   'hours',   'violation', '勞基法第 34 條'),
  (NULL, 'WEEKLY_REST_DAY',      '每七日出勤',     '每 7 日內至少應有 1 日休息',              1,    'days',    'violation', '勞基法第 36 條'),
  (NULL, 'MAX_CONSECUTIVE_DAYS', '連續出勤上限',   '建議連續出勤不超過 6 日',                 6,    'days',    'warning',   '勞基法第 36 條'),
  (NULL, 'CLOCK_LOCATION',       '打卡地點異常',   '打卡位置超出診所允許範圍',                200,  'meters',  'warning',   NULL),
  (NULL, 'CLOCK_TIME_LATE',      '遲到',           '打卡時間晚於排班開始超過 5 分鐘',          5,    'minutes', 'warning',   NULL),
  (NULL, 'MISSING_CLOCK_OUT',    '漏打下班卡',     '有上班卡但無下班卡',                      NULL, NULL,      'warning',   NULL);

-- ============================================================
-- 13. updated_at Trigger
-- ============================================================

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_clinics_updated BEFORE UPDATE ON clinics FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_employees_updated BEFORE UPDATE ON employees FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_shift_types_updated BEFORE UPDATE ON shift_types FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_schedules_updated BEFORE UPDATE ON schedules FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_assignments_updated BEFORE UPDATE ON shift_assignments FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_swap_updated BEFORE UPDATE ON shift_swap_requests FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_payroll_settings_updated BEFORE UPDATE ON payroll_settings FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_payroll_runs_updated BEFORE UPDATE ON payroll_runs FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_payroll_items_updated BEFORE UPDATE ON payroll_items FOR EACH ROW EXECUTE FUNCTION set_updated_at();
