import {
  FLEXIBLE_LABOR,
  addDaysTaipei,
  alignToFixedCycle,
} from "@/lib/shift-templates";
import { CLINIC_PAYROLL } from "@/lib/payroll/constants";
import type { DayOffRecord } from "@/lib/compliance/types";

/** 休息日出勤以半天診 4 小時計算 */
export const REST_DAY_HALF_DAY_HOURS = 4;

/**
 * 休息日半天診加班費固定值（避免小數進位爭議）：
 * (142×1.34×2)＋(142×1.67×2)＝855
 */
export const REST_DAY_HALF_DAY_PAY = CLINIC_PAYROLL.REST_DAY_HALF_DAY_PAY;

/** 每個 28 天週期法定應休天數（例假＋休息） */
export const MIN_OFF_DAYS_PER_CYCLE = FLEXIBLE_LABOR.MIN_OFF_DAYS_PER_CYCLE;

/**
 * 取得四週變形工時基準日（Anchor）。
 * 由 FLEXIBLE_LABOR.CYCLE_EPOCH_MONDAY 提供（可經環境變數 FLEX_SCHEDULE_ANCHOR_DATE 設定），
 * 與合規檢查共用同一錨點，確保 28 天週期完全一致。
 */
export function getFlexScheduleAnchor(): string {
  return FLEXIBLE_LABOR.CYCLE_EPOCH_MONDAY;
}

/** 單一 28 天週期的休假檢核結果 */
export interface RestDayCycleDetail {
  /** 週期起日（YYYY-MM-DD） */
  start: string;
  /** 週期迄日（YYYY-MM-DD，start + 27 天） */
  end: string;
  /** 該週期內被標記為休假（例假／休息）的天數 */
  offDays: number;
  /** 短少天數＝max(0, 8 − 休假天數) */
  shortfallDays: number;
  /** 該週期短少對應之休息日加班費（shortfallDays × 855） */
  pay: number;
}

export interface RestDayShortfallResult {
  /** 結束日落在本曆月的所有週期，合計應休天數（8 × 週期數） */
  requiredOffDays: number;
  /** 上述週期實際休假天數合計 */
  actualOffDays: number;
  /** 短少天數合計＝視為休息日出勤天數 */
  shortfallDays: number;
  halfDayPayEach: number;
  /** 休息日加班費合計 */
  restDayOvertimePay: number;
  formula: string;
  /** 逐週期檢核明細（供薪資單顯示結算週期） */
  cycles: RestDayCycleDetail[];
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
 * 找出「結束日（End Date）」落在 [monthStart, monthEnd] 區間內的所有固定 28 天週期。
 * 週期以 Anchor Date 為起點、每 28 天非重疊切分，與曆月天數（30／31）完全脫鉤。
 */
export function cyclesEndingWithin(
  monthStart: string,
  monthEnd: string,
  cycleDays: number = FLEXIBLE_LABOR.CYCLE_DAYS,
  anchor: string = getFlexScheduleAnchor()
): { start: string; end: string }[] {
  const cycles: { start: string; end: string }[] = [];

  // 從「包含 monthStart 的週期」往前兩個週期起算，確保涵蓋結束日落在月初的週期。
  let cursor = addDaysTaipei(
    alignToFixedCycle(monthStart, cycleDays, anchor),
    -cycleDays * 2
  );

  // 28 天週期在一個曆月內最多 2 個結束日；迭代 6 次已足夠涵蓋。
  for (let i = 0; i < 6; i++) {
    const end = addDaysTaipei(cursor, cycleDays - 1);
    if (end >= monthStart && end <= monthEnd) {
      cycles.push({ start: cursor, end });
    }
    cursor = addDaysTaipei(cursor, cycleDays);
  }

  return cycles;
}

/**
 * 統計指定員工在某個 28 天週期內，被標記為休假（例假 statutory／休息 rest）的天數。
 * 特休等法定給假不計入「完整休假」。
 */
export function countCycleOffDays(
  employeeId: string,
  cycleStart: string,
  cycleEnd: string,
  dayOffs: DayOffRecord[]
): number {
  const offDates = new Set<string>();
  for (const d of dayOffs) {
    if (d.employeeId !== employeeId) continue;
    if (d.date < cycleStart || d.date > cycleEnd) continue;
    if (d.type === "statutory" || d.type === "rest") {
      offDates.add(d.date);
    }
  }
  return offDates.size;
}

/**
 * 曆月薪資結算（與 28 天週期脫鉤）：
 * 1. 依 Anchor Date 切出固定 28 天週期。
 * 2. 找出「結束日落在本曆月」的所有週期。
 * 3. 對每個週期檢核休假是否 < 8 天；短少日數以半天診固定 855 元計加班費。
 * 4. 加總後歸入本曆月應發薪資。
 *
 * 如此可正確處理跨月週期：一個週期即使橫跨兩個曆月，其加班費只會在「結束日所在月」
 * 結算一次，不會因曆月 30／31 天而多算或少算。
 */
export function calculateRestDayShortfall(input: {
  employeeId: string;
  /** 曆月起日（YYYY-MM-01） */
  periodStart: string;
  /** 曆月迄日（該月最後一日） */
  periodEnd: string;
  dayOffs: DayOffRecord[];
}): RestDayShortfallResult {
  const { employeeId, periodStart, periodEnd, dayOffs } = input;
  const { pay: halfDayPayEach } = calculateRestDayHalfDayPay();

  const cycleRanges = cyclesEndingWithin(periodStart, periodEnd);

  const cycles: RestDayCycleDetail[] = cycleRanges.map((c) => {
    const offDays = countCycleOffDays(employeeId, c.start, c.end, dayOffs);
    const shortfallDays = Math.max(0, MIN_OFF_DAYS_PER_CYCLE - offDays);
    return {
      start: c.start,
      end: c.end,
      offDays,
      shortfallDays,
      pay: shortfallDays * halfDayPayEach,
    };
  });

  const shortfallDays = cycles.reduce((s, c) => s + c.shortfallDays, 0);
  const actualOffDays = cycles.reduce((s, c) => s + c.offDays, 0);
  const requiredOffDays = cycles.length * MIN_OFF_DAYS_PER_CYCLE;
  const restDayOvertimePay = shortfallDays * halfDayPayEach;

  const formula =
    cycles.length === 0
      ? "本月無結束於本月的四週變形週期"
      : cycles
          .map(
            (c) =>
              `${c.start}~${c.end}：休 ${c.offDays}／應 ${MIN_OFF_DAYS_PER_CYCLE}` +
              (c.shortfallDays > 0
                ? `，短少 ${c.shortfallDays}×${halfDayPayEach}=${c.pay}`
                : "（足額）")
          )
          .join("；");

  return {
    requiredOffDays,
    actualOffDays,
    shortfallDays,
    halfDayPayEach,
    restDayOvertimePay,
    formula,
    cycles,
  };
}
