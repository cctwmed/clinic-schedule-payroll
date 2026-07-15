-- 診所管理員旗標（護理師兼管理職）
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS is_clinic_admin BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN employees.is_clinic_admin IS '是否為診所管理員（可切換 LIFF 管理員模式、審核補登）';

CREATE INDEX IF NOT EXISTS idx_employees_clinic_admin
  ON employees(clinic_id, is_clinic_admin)
  WHERE is_clinic_admin = true;

NOTIFY pgrst, 'reload schema';
