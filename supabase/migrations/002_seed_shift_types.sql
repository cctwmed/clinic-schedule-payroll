-- 診所預設班別：早診、午診、晚診、休診
-- 需先建立 clinics 資料後執行，或使用 seed.sql

-- 範例：若已有診所 ID，可取消註解並替換 clinic_id
/*
INSERT INTO shift_types (clinic_id, code, name, category, default_clock_in, default_clock_out, break_minutes, planned_hours, color_hex, sort_order) VALUES
  ('YOUR_CLINIC_ID', 'MORNING',   '早診', 'morning',   '08:00', '12:00', 0, 4.00, '#F59E0B', 1),
  ('YOUR_CLINIC_ID', 'AFTERNOON', '午診', 'afternoon', '14:00', '17:30', 0, 3.50, '#3B82F6', 2),
  ('YOUR_CLINIC_ID', 'EVENING',   '晚診', 'evening',   '18:00', '21:00', 0, 3.00, '#8B5CF6', 3),
  ('YOUR_CLINIC_ID', 'CLOSED',    '休診', 'closed',    NULL,    NULL,    0, 0.00, '#9CA3AF', 4);
*/
