-- ============================================================
-- 修復 RLS：診所內部後台 MVP（使用 anon key 從 Next.js 寫入）
-- 在 Supabase SQL Editor 執行此檔一次即可
-- ============================================================

-- 允許 anon / authenticated 讀寫營運資料表
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
    'payroll_settings',
    'payroll_allowances',
    'payroll_runs',
    'payroll_items',
    'compliance_alerts',
    'notifications'
  ])
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS allow_anon_all ON %I', t);
    EXECUTE format(
      'CREATE POLICY allow_anon_all ON %I FOR ALL TO anon USING (true) WITH CHECK (true)',
      t
    );
    EXECUTE format('DROP POLICY IF EXISTS allow_authenticated_all ON %I', t);
    EXECUTE format(
      'CREATE POLICY allow_authenticated_all ON %I FOR ALL TO authenticated USING (true) WITH CHECK (true)',
      t
    );
  END LOOP;
END $$;

-- 勞基法規則：僅允許讀取（種子資料）
ALTER TABLE compliance_rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS allow_anon_read ON compliance_rules;
CREATE POLICY allow_anon_read ON compliance_rules
  FOR SELECT TO anon USING (true);
DROP POLICY IF EXISTS allow_authenticated_read ON compliance_rules;
CREATE POLICY allow_authenticated_read ON compliance_rules
  FOR SELECT TO authenticated USING (true);

-- 建立診所 + GPS（若尚無資料）
INSERT INTO clinics (name, latitude, longitude, geo_radius_m)
SELECT '診所', 24.67873, 121.76421, 200
WHERE NOT EXISTS (SELECT 1 FROM clinics LIMIT 1);

-- 若已有診所但缺 GPS，一併更新
UPDATE clinics
SET
  latitude = 24.67873,
  longitude = 121.76421,
  geo_radius_m = 200
WHERE latitude IS NULL OR longitude IS NULL OR geo_radius_m IS DISTINCT FROM 200;
