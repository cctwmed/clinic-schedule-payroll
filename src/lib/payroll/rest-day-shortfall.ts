import { FLEXIBLE_LABOR, daysBetweenTaipei } from "@/lib/shift-templates";
import { CLINIC_PAYROLL } from "@/lib/payroll/constants";
import type { DayOffRecord } from "@/lib/compliance/types";

/** 休息日出勤以半天診 4 小時計算 */
export const REST_DAY_HALF_DAY_HOURS = 4;

/**
 * 休息日半天診加班費固定值（避免小數進位爭議）：
 * (142×1.34×2)＋(142×1.67×2)＝855
 */
export const REST_DAY_HALF_DAY_PAY = CLINIC_PAYROLL.REST_DAY_HALF_DAY_PAY;

export interface RestDayShortfallResult {
  periodDays: number;
  requiredOffDays: number;
  /** 例假＋休息日（不含特休等法定給假） */
  actualOffDays: number;
  /** 短少天數＝視為休息日出勤天數 */
  shortfallDays: number;
  halfDayPayEach: number;
  restDayOvertimePay: number;
  formula: string;
}

/** 半天診休息日加班費：固定 855 元 */
export function calculateRestDayHalfDayPay(): {
  pay: number;
  formula: string;
} {
  return {
    pay: REST_DAY_HALF_DAY_PAY,
    formula: `(${CLINIC_PAYROLL.OT_HOURLY_RATE}×1.34×2h)＋(${CLINIC_PAYROLL.OT_HOURLY_RATE}×1.67×2h)＝${REST_DAY_HALF_DAY_PAY}（固定）`,
  };
}

/**
 * 四週變形：每 28 日應有 8 日完整休假（例假＋休息日）。
 * 短少日數僅能以「休息日出勤」認列，並依半天診固定 855 元計加班費。
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

  // 僅例假＋休息日計入「完整休假」；短少部分不得改標例假，一律以休息日出勤處理
  const offDates = new Set<string>();
  for (const d of dayOffs) {
    if (d.employeeId !== employeeId) continue;
    if (d.date < periodStart || d.date > periodEnd) continue;
    if (d.type === "statutory" || d.type === "rest") {
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
