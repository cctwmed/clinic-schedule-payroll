import {
  FULL_TIME_INSURANCE_BRACKETS,
  guessInsuranceBracket,
  getInsuranceBracket,
} from "@/lib/payroll/insurance-brackets";

export interface InsuranceBracketWarning {
  employeeId: string;
  employeeName: string;
  currentInsuredSalary: number;
  months: { year: number; month: number; grossPay: number }[];
  /** 連續超標月數（≥3 才提示） */
  consecutiveMonthsOver: number;
  suggestedMinInsuredSalary: number | null;
  message: string;
}

function prevYearMonth(year: number, month: number): { year: number; month: number } {
  if (month <= 1) return { year: year - 1, month: 12 };
  return { year, month: month - 1 };
}

/** 找出嚴格大於 current 的下一檔全職投保薪資 */
export function nextFullTimeBracketAbove(current: number): number | null {
  const next = FULL_TIME_INSURANCE_BRACKETS.find((b) => b.insuredSalary > current);
  return next?.insuredSalary ?? null;
}

/**
 * 若連續三個月「含加班之總應發」皆高於目前投保薪資級距，提示需調整投保。
 */
export function buildInsuranceBracketWarnings(input: {
  year: number;
  month: number;
  employees: {
    id: string;
    name: string;
    laborInsuranceSelfPay: number;
    healthInsuranceSelfPay: number;
    laborInsuranceEmployerPay: number;
  }[];
  /** key: `${year}-${month}-${employeeId}` → grossPay */
  grossByMonthEmployee: Map<string, number>;
}): InsuranceBracketWarning[] {
  const warnings: InsuranceBracketWarning[] = [];

  const months: { year: number; month: number }[] = [];
  let y = input.year;
  let m = input.month;
  for (let i = 0; i < 3; i++) {
    months.unshift({ year: y, month: m });
    const prev = prevYearMonth(y, m);
    y = prev.year;
    m = prev.month;
  }

  for (const emp of input.employees) {
    const insuredGuess = guessInsuranceBracket({
      labor_insurance_self_pay: emp.laborInsuranceSelfPay,
      health_insurance_self_pay: emp.healthInsuranceSelfPay,
      labor_insurance_employer_pay: emp.laborInsuranceEmployerPay,
    });
    const currentInsured =
      typeof insuredGuess === "number"
        ? insuredGuess
        : getInsuranceBracket(34_800)?.insuredSalary ?? 34_800;

    const monthRows: { year: number; month: number; grossPay: number }[] = [];
    let consecutive = 0;
    let streakOk = true;

    for (const ym of months) {
      const key = `${ym.year}-${ym.month}-${emp.id}`;
      const gross = input.grossByMonthEmployee.get(key);
      if (gross == null) {
        streakOk = false;
        break;
      }
      monthRows.push({ year: ym.year, month: ym.month, grossPay: gross });
      if (gross > currentInsured) consecutive += 1;
      else {
        streakOk = false;
        break;
      }
    }

    if (!streakOk || consecutive < 3) continue;

    const maxGross = Math.max(...monthRows.map((r) => r.grossPay));
    const suggested =
      nextFullTimeBracketAbove(currentInsured) ??
      nextFullTimeBracketAbove(maxGross - 1) ??
      null;

    warnings.push({
      employeeId: emp.id,
      employeeName: emp.name,
      currentInsuredSalary: currentInsured,
      months: monthRows,
      consecutiveMonthsOver: consecutive,
      suggestedMinInsuredSalary: suggested,
      message: `依勞保條例需調整投保薪資級距：${emp.name} 已連續 ${consecutive} 個月「含加班總應發」高於目前投保級距 ${currentInsured.toLocaleString("zh-TW")} 元${
        suggested ? `（建議至少調整至 ${suggested.toLocaleString("zh-TW")} 元）` : ""
      }`,
    });
  }

  return warnings;
}
