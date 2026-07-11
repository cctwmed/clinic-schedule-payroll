-- 打卡紀錄：遲到與主管修正欄位
ALTER TABLE clock_records
  ADD COLUMN IF NOT EXISTS is_late BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS late_minutes INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS expected_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS is_manually_corrected BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS corrected_by TEXT,
  ADD COLUMN IF NOT EXISTS corrected_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS original_clocked_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_clock_late ON clock_records(is_late) WHERE is_late = true;
CREATE INDEX IF NOT EXISTS idx_clock_manual ON clock_records(is_manually_corrected) WHERE is_manually_corrected = true;
