import { CLINIC_PAYROLL } from "@/lib/payroll/constants";
import type { LeaveEntitlementPeriod } from "@/types/leave";

/** 依勞基法第 38 條週年制：完成滿 N 週年時該週期可休天數 */
export function getEntitledDaysForAnniversaryYear(completedYears: number): number {
  if (completedYears < 1) return 3;
  if (completedYears === 1) return 7;
  if (completedYears === 2) return 10;
  if (completedYears === 3 || completedYears === 4) return 14;
  if (completedYears >= 5 && completedYears <= 9) return 15;
  return Math.min(30, 15 + (completedYears - 9));
}

/** 勞基法第 38 條特休天數一覽（畫面說明用） */
export const ANNUAL_LEAVE_ENTITLEMENT_ROWS: { label: string; days: number }[] = [
  { label: "六個月以上一年未滿", days: 3 },
  { label: "一年以上二年未滿", days: 7 },
  { label: "二年以上三年未滿", days: 10 },
  { label: "三年以上五年未滿", days: 14 },
  { label: "五年以上十年未滿", days: 15 },
  { label: "十年以上（每年加給一日，加至三十日）", days: 16 },
];

function formatTaipeiDate(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function parseTaipeiDate(dateStr: string): Date {
  return new Date(`${dateStr}T12:00:00+08:00`);
}

export function addDays(dateStr: string, days: number): string {
  const base = parseTaipeiDate(dateStr);
  base.setTime(base.getTime() + days * 86_400_000);
  return formatTaipeiDate(base);
}

export function addMonths(dateStr: string, months: number): string {
  const d = parseTaipeiDate(dateStr);
  const y = d.getFullYear();
  const m = d.getMonth();
  const day = d.getDate();
  const next = new Date(y, m + months, day);
  return formatTaipeiDate(next);
}

export function addYears(dateStr: string, years: number): string {
  return addMonths(dateStr, years * 12);
}

export function daysBefore(dateStr: string): string {
  return addDays(dateStr, -1);
}

export function resolveEmployeeArrivalDate(
  arrivalDate: string | null | undefined,
  hireDate: string | null | undefined
): string | null {
  return arrivalDate ?? hireDate ?? null;
}

/**
 * 依到職日與基準日，解析目前適用之特休週期（週年制）。
 * 滿 6 個月始有第一週期；到期日為下一週年前一日。
 */
export function resolveCurrentLeavePeriod(
  arrivalDate: string,
  asOfDate?: string
): LeaveEntitlementPeriod | null {
  const asOf = asOfDate ?? formatTaipeiDate(new Date());
  const sixMonthMark = addMonths(arrivalDate, 6);
  if (asOf < sixMonthMark) return null;

  for (let completedYears = 0; completedYears <= 40; completedYears++) {
    const periodStart =
      completedYears === 0 ? sixMonthMark : addYears(arrivalDate, completedYears);
    const nextAnniversary = addYears(arrivalDate, completedYears + 1);
    const expiryDate = daysBefore(nextAnniversary);
    const totalDays = getEntitledDaysForAnniversaryYear(completedYears);

    if (asOf >= periodStart && asOf <= expiryDate) {
      const seniorityLabel =
        completedYears === 0
          ? "滿 6 個月～未滿 1 年"
          : `滿 ${completedYears} 年`;
      return {
        periodStart,
        periodEnd: expiryDate,
        expiryDate,
        totalDays,
        seniorityLabel,
      };
    }
  }

  return null;
}

export function calculateUnusedLeaveDays(totalDays: number, usedDays: number): number {
  return Math.max(0, Math.round((totalDays - usedDays) * 10) / 10);
}

/** 未休畢特休工資：(月薪 / 30) × 未休天數 */
export function calculateAnnualLeavePayout(
  unusedDays: number,
  monthlySalary: number = CLINIC_PAYROLL.MONTHLY_BASE_SALARY
): number {
  if (unusedDays <= 0) return 0;
  return Math.round((monthlySalary / 30) * unusedDays);
}

export function taipeiToday(): string {
  return formatTaipeiDate(new Date());
}
