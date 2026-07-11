import { CLINIC_PAYROLL } from "@/lib/payroll/constants";

export interface YearEndBonusInput {
  hireDate: string;
  payrollYear: number;
  resignDate?: string | null;
  manualAmount?: number | null;
  useManualOverride?: boolean;
}

export interface YearEndBonusResult {
  /** 系統按比例計算金額 */
  calculatedAmount: number;
  /** 實際發放（含院長覆核） */
  finalAmount: number;
  serviceMonths: number;
  isOverridden: boolean;
  formula: string;
}

/**
 * 依入職日計算當年度服務月數（含到職月，上限 12）
 * 例：當年工作 6 個月 → 34,000 × 6/12 = 17,000
 */
export function countServiceMonthsInYear(
  hireDate: string,
  year: number,
  resignDate?: string | null
): number {
  const hire = new Date(`${hireDate}T12:00:00+08:00`);
  const yearStart = new Date(`${year}-01-01T00:00:00+08:00`);
  const yearEnd = new Date(`${year}-12-31T23:59:59+08:00`);

  let end = yearEnd;
  if (resignDate) {
    const resign = new Date(`${resignDate}T23:59:59+08:00`);
    if (resign < end) end = resign;
  }

  const start = hire > yearStart ? hire : yearStart;
  if (start > end) return 0;

  const startIdx = start.getFullYear() * 12 + start.getMonth();
  const endIdx = end.getFullYear() * 12 + end.getMonth();
  const months = endIdx - startIdx + 1;

  return Math.min(CLINIC_PAYROLL.YEAR_END_MONTHS_BASE, Math.max(0, months));
}

export function calculateYearEndBonus(input: YearEndBonusInput): YearEndBonusResult {
  const { hireDate, payrollYear, resignDate, manualAmount, useManualOverride } = input;
  const serviceMonths = countServiceMonthsInYear(hireDate, payrollYear, resignDate);

  const calculatedAmount = Math.round(
    (CLINIC_PAYROLL.YEAR_END_FULL_AMOUNT * serviceMonths) /
      CLINIC_PAYROLL.YEAR_END_MONTHS_BASE
  );

  const isOverridden = Boolean(useManualOverride && manualAmount != null && manualAmount >= 0);
  const finalAmount = isOverridden ? Math.round(manualAmount!) : calculatedAmount;

  const formula = `${CLINIC_PAYROLL.YEAR_END_FULL_AMOUNT.toLocaleString("zh-TW")} × ${serviceMonths}/${CLINIC_PAYROLL.YEAR_END_MONTHS_BASE}`;

  return {
    calculatedAmount,
    finalAmount,
    serviceMonths,
    isOverridden,
    formula,
  };
}
