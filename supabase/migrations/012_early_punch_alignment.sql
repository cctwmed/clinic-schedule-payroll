-- 提早打卡對齊與院長審核欄位
ALTER TABLE clock_records
  ADD COLUMN IF NOT EXISTS is_early BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS early_minutes INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payable_clocked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS is_early_abnormal BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS early_work_approved BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS early_reviewed_by TEXT,
  ADD COLUMN IF NOT EXISTS early_reviewed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_clock_early_abnormal
  ON clock_records(is_early_abnormal)
  WHERE is_early_abnormal = true AND clock_type = 'clock_in';

COMMENT ON COLUMN clock_records.payable_clocked_at IS '薪資工時起算時間（預設對齊班表；核可提早後改為實際打卡）';
COMMENT ON COLUMN clock_records.is_early_abnormal IS '提早超過緩衝分鐘，待院長審核';
