-- 開發用種子資料（本地 Supabase: supabase db reset 時自動載入）

-- 示範診所
INSERT INTO clinics (id, name, address, phone, latitude, longitude, geo_radius_m)
VALUES (
  '11111111-1111-1111-1111-111111111111',
  '示範診所',
  '台北市信義區示範路 1 號',
  '02-1234-5678',
  25.0330,
  121.5654,
  300
);

-- 預設班別
INSERT INTO shift_types (clinic_id, code, name, category, default_clock_in, default_clock_out, break_minutes, planned_hours, color_hex, sort_order) VALUES
  ('11111111-1111-1111-1111-111111111111', 'MORNING',   '早診', 'morning',   '08:00', '12:00', 0, 4.00, '#F59E0B', 1),
  ('11111111-1111-1111-1111-111111111111', 'AFTERNOON', '午診', 'afternoon', '14:00', '17:30', 0, 3.50, '#3B82F6', 2),
  ('11111111-1111-1111-1111-111111111111', 'EVENING',   '晚診', 'evening',   '18:00', '21:00', 0, 3.00, '#8B5CF6', 3),
  ('11111111-1111-1111-1111-111111111111', 'CLOSED',    '休診', 'closed',    NULL,    NULL,    0, 0.00, '#9CA3AF', 4);

-- 示範護理師（2 位）
INSERT INTO employees (
  id, clinic_id, employee_no, name, role, hire_date, hourly_wage,
  labor_insurance_self_pay, health_insurance_self_pay,
  labor_insurance_employer_pay, health_insurance_employer_pay, labor_pension_employer_pay
) VALUES
  ('22222222-2222-2222-2222-222222222201', '11111111-1111-1111-1111-111111111111', 'N001', '王護理師', 'nurse', '2024-01-01', 220.00, 1100.00, 450.00, 3850.00, 1400.00, 1800.00),
  ('22222222-2222-2222-2222-222222222202', '11111111-1111-1111-1111-111111111111', 'N002', '李護理師', 'nurse', '2024-06-01', 200.00, 950.00, 400.00, 3300.00, 1200.00, 1500.00);

-- 七月模擬（遠端 DB 請執行 node scripts/seed-july-simulation.mjs）
-- 王護理師：7/8–7/9 特休；7/7 異常提早打卡（07:40，班表 08:20）
-- 李護理師：7/15 特休；7/14 準時打卡

-- 七月模擬（遠端 DB 請執行：node scripts/seed-july-simulation.mjs）
-- 王護理師：7/8–7/9 特休；李護理師：7/15 特休
-- 7/14 打卡：王 07:40 異常提早、李 08:18 正常

-- July 2026 demo: node scripts/seed-july-simulation.mjs (N001/N002, Jul leave & clock samples)

