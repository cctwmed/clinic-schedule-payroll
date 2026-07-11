-- 雙人全正職輪替黃金班表：員工職稱欄位
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS job_title TEXT;

COMMENT ON COLUMN employees.job_title IS '診所職稱，例如：護理組長、正職護理師';
