-- 補登申請關聯診別（早診／晚診／午診）
ALTER TABLE clock_correction_requests
  ADD COLUMN IF NOT EXISTS assignment_id UUID REFERENCES shift_assignments(id) ON DELETE SET NULL;

COMMENT ON COLUMN clock_correction_requests.assignment_id IS '對應 shift_assignments，標示早診／晚診等診別';

CREATE INDEX IF NOT EXISTS idx_clock_correction_assignment
  ON clock_correction_requests(assignment_id)
  WHERE assignment_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';
