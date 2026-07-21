-- 生理假（法定假別；不扣全勤）
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'leave_record_type' AND e.enumlabel = 'menstrual'
  ) THEN
    ALTER TYPE leave_record_type ADD VALUE 'menstrual';
  END IF;
END $$;
