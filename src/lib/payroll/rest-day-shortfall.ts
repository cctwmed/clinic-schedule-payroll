import { FLEXIBLE_LABOR, daysBetweenTaipei } from "@/lib/shift-templates";
import { calculateOvertimePay } from "@/lib/payroll/overtime-pay";
import type { DayOffRecord } from "@/lib/compliance/types";

/** 休息日出勤以半天診 4 小時套用加班公式（與使用者法規需求一致） */
export const REST_DAY_HALF_DAY_HOURS = 4;

export interface RestDayShortfallResult {
  /** 計薪區間天數 */
  periodDays: number;
  /** 依法應休天數（四週 8 天等比換算） */
  requiredOffDays: number;
  /** 實際完整休假天數（例假＋休息日＋特休） */
  actualOffDays: number;
  /** 短少天數＝休息日出勤天數 */
  shortfallDays: number;
  /** 單日半天休息日加班費 */
  halfDayPayEach: number;
  /** 休息日加班費合計（短少天數 × 半天公式；與是否滿 160h 無關） */
  restDayOvertimePay: number;
  formula: string;
}

/** 半天診休息日出勤：(時薪×1.34×2h)＋(時薪×1.67×2h) */
export function calculateRestDayHalfDayPay(): {
  pay: number;
  formula: string;
  breakdown: ReturnType<typeof calculateOvertimePay>;
} {
  const breakdown = calculateOvertimePay(REST_DAY_HALF_DAY_HOURS, "rest_day");
  const formula = `(${breakdown.tier1Rate.toFixed(2)}×${breakdown.tier1Hours}h)＋(${breakdown.tier2Rate.toFixed(2)}×${breakdown.tier2Hours}h)＝${breakdown.totalPay}`;
  return { pay: breakdown.totalPay, formula, breakdown };
}

/**
 * 四週變形：每 28 日應有 8 日完整休假。
 * 計薪週期內依比例計算應休天數；短少日數視為休息日出勤（半天診加班費）。
 * 不因四週工時未達 160h 而略過。
 */
export function calculateRestDayShortfall(input: {
  employeeId: string;
  periodStart: string;
  periodEnd: string;
  dayOffs: DayOffRecord[];
}): RestDayShortfallResult {
  const { employeeId, periodStart, periodEnd, dayOffs } = input;
  const periodDays = Math.max(1, daysBetweenTaipei(periodStart, periodEnd) + 1);

  const requiredOffDays = Math.round(
    (periodDays / FLEXIBLE_LABOR.CYCLE_DAYS) * FLEXIBLE_LABOR.MIN_OFF_DAYS_PER_CYCLE
  );

  const offDates = new Set<string>();
  for (const d of dayOffs) {
    if (d.employeeId !== employeeId) continue;
    if (d.date < periodStart || d.date > periodEnd) continue;
    if (d.type === "statutory" || d.type === "rest" || d.type === "annual_leave") {
      offDates.add(d.date);
    }
  }

  const actualOffDays = offDates.size;
  const shortfallDays = Math.max(0, requiredOffDays - actualOffDays);
  const { pay: halfDayPayEach, formula } = calculateRestDayHalfDayPay();
  const restDayOvertimePay = shortfallDays * halfDayPayEach;

  return {
    periodDays,
    requiredOffDays,
    actualOffDays,
    shortfallDays,
    halfDayPayEach,
    restDayOvertimePay,
    formula,
  };
}
