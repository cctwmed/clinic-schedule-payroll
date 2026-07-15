-- 員工勞健保／勞退：個人自付 + 雇主負擔欄位
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS labor_insurance_employer_pay NUMERIC(10, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS health_insurance_employer_pay NUMERIC(10, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS labor_pension_employer_pay NUMERIC(10, 2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN employees.labor_insurance_employer_pay IS '勞保雇主負擔額（診所負擔）';
COMMENT ON COLUMN employees.health_insurance_employer_pay IS '健保雇主負擔額（診所負擔）';
COMMENT ON COLUMN employees.labor_pension_employer_pay IS '勞退雇主提繳 6%（診所全額負擔）';
