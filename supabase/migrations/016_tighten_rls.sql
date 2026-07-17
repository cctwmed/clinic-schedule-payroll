-- ============================================================
-- 016：收緊 RLS — 撤銷 anon 全開放，僅 authenticated 可讀寫
-- 應用程式伺服器端改以 service_role 存取（略過 RLS）
-- 請在 Supabase SQL Editor 執行
-- ============================================================

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
    'annual_leave_balances'
  ])
  LOOP
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = t) THEN
      EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
      EXECUTE format('DROP POLICY IF EXISTS allow_anon_all ON %I', t);
      EXECUTE format('DROP POLICY IF EXISTS allow_authenticated_all ON %I', t);
      EXECUTE format(
        'CREATE POLICY authenticated_all ON %I FOR ALL TO authenticated USING (true) WITH CHECK (true)',
        t
      );
    END IF;
  END LOOP;
END $$;

-- 勞基法規則：僅 authenticated 可讀
ALTER TABLE compliance_rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS allow_anon_read ON compliance_rules;
DROP POLICY IF EXISTS allow_authenticated_read ON compliance_rules;
CREATE POLICY authenticated_read ON compliance_rules
  FOR SELECT TO authenticated USING (true);
