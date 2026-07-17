-- 017：員工生日、健保投保方式、童工標記、直系血親
ALTER TABLE employees ADD COLUMN IF NOT EXISTS birth_date DATE;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS national_id TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS health_insurance_enrollment TEXT NOT NULL DEFAULT 'clinic';
ALTER TABLE employees ADD COLUMN IF NOT EXISTS is_related_to_owner BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS is_child_laborer BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN employees.birth_date IS '出生日期（年齡合規檢測）';
COMMENT ON COLUMN employees.national_id IS '身分證字號（選填，僅後台使用，可解析生日）';
COMMENT ON COLUMN employees.health_insurance_enrollment IS 'clinic=診所投保, dependent=眷屬依附, none=不投保';
COMMENT ON COLUMN employees.is_related_to_owner IS '是否為負責人直系血親';
COMMENT ON COLUMN employees.is_child_laborer IS '童工標記（15–16 歲，排班夜間防呆）';
