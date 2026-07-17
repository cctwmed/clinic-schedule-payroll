-- 019：產假、安胎假假別（可重複執行）
DO $$
BEGIN
  ALTER TYPE leave_record_type ADD VALUE IF NOT EXISTS 'maternity';
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TYPE leave_record_type ADD VALUE IF NOT EXISTS 'pregnancy_rest';
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN NULL;
END $$;

-- 相容較舊 PostgreSQL（無 IF NOT EXISTS 時改用手寫）
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'leave_record_type' AND e.enumlabel = 'maternity'
  ) THEN
    ALTER TYPE leave_record_type ADD VALUE 'maternity';
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'leave_record_type' AND e.enumlabel = 'pregnancy_rest'
  ) THEN
    ALTER TYPE leave_record_type ADD VALUE 'pregnancy_rest';
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

NOTIFY pgrst, 'reload schema';
