-- 在 Supabase → SQL Editor 一次執行（雲端若只跑過 001 初始 schema）
-- 執行後請重新整理後台「員工管理」頁面

-- 004：員工職稱
ALTER TABLE employees ADD COLUMN IF NOT EXISTS job_title TEXT;

-- 005：打卡遲到與主管修正
ALTER TABLE clock_records
  ADD COLUMN IF NOT EXISTS is_late BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS late_minutes INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS expected_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS is_manually_corrected BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS corrected_by TEXT,
  ADD COLUMN IF NOT EXISTS corrected_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS original_clocked_at TIMESTAMPTZ;

NOTIFY pgrst, 'reload schema';
