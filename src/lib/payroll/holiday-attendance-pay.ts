import {
  getTaiwanPublicHolidayName,
  isTaiwanPublicHoliday,
} from "@/lib/holidays/taiwan-public-holidays";
import { CLINIC_PAYROLL } from "@/lib/payroll/constants";
import { resolvePayableClockIn } from "@/lib/clock/early-punch";
import type { ClockEvent, WorkShiftBlock } from "@/lib/compliance/types";

const WORK_SHIFT_CODES = new Set(["MORNING", "EVENING", "AFTERNOON"]);
const HOLIDAY_BASE_HOURS = 8;

export interface HolidayDayPayDetail {
  date: string;
  holidayName: string | null;
  totalWorkHours: number;
  scenario: "A" | "B";
  /** 法定加倍工資（前 8 小時固定 1136） */
  doublePay: number;
  /** 超過 8 小時之延長工時加班費 */
  overtimePay: number;
  overtimeHoursTier1: number;
  overtimeHoursTier2: number;
  overtimeTier1Rate: number;
  overtimeTier2Rate: number;
  totalPay: number;
  hasClockIn: boolean;
}

export interface HolidayAttendancePayResult {
  days: number;
  /** 加倍薪資合計（1136 × 天數） */
  doublePayTotal: number;
  /** 國定假日超過 8h 延長工時加班費合計 */
  overtimePayTotal: number;
  /** 加總 = doublePayTotal + overtimePayTotal */
  totalPay: number;
  dates: string[];
  dayDetails: HolidayDayPayDetail[];
  /** 需自一般加班統計排除的日期（避免重複計算） */
  excludeFromRegularOtDates: string[];
}

export interface HolidayPayContext {
  /** 班表標記或行政院國定假日（排除休診日） */
  holidayDates: Set<string>;
}

function hoursBetween(endIso: string, startIso: string): number {
  return (new Date(endIso).getTime() - new Date(startIso).getTime()) / (1000 * 60 * 60);
}

/** 當日實際工時：依打卡 in/out 配對加總；若只有上班卡則 fallback 排班時數 */
function computeDayWorkHours(
  employeeId: string,
  date: string,
  clocks: ClockEvent[],
  shifts: WorkShiftBlock[]
): number {
  const dayClocks = clocks
    .filter((c) => c.employeeId === employeeId && c.clockedAt.startsWith(date))
    .sort((a, b) => a.clockedAt.localeCompare(b.clockedAt));

  let total = 0;
  for (let i = 0; i < dayClocks.length; i++) {
    if (dayClocks[i].clockType !== "clock_in") continue;
    const inAt = resolvePayableClockIn(
      dayClocks[i].clockedAt,
      dayClocks[i].payableClockedAt,
      dayClocks[i].earlyWorkApproved
    );
    const out = dayClocks
      .slice(i + 1)
      .find((c) => c.clockType === "clock_out");
    if (out) {
      total += hoursBetween(out.clockedAt, inAt);
    }
  }

  if (total > 0) return roundHours(total);

  const hasClockIn = dayClocks.some((c) => c.clockType === "clock_in");
  if (!hasClockIn) return 0;

  const planned = shifts
    .filter(
      (s) =>
        s.employeeId === employeeId &&
        s.date === date &&
        WORK_SHIFT_CODES.has(s.shiftCode)
    )
    .reduce((sum, s) => sum + s.plannedHours, 0);

  return roundHours(planned);
}

function roundHours(h: number): number {
  return Math.round(h * 100) / 100;
}

/**
 * 單日國定假日出勤計薪（8 小時分水嶺）
 * - ≤8h：固定 142×8 = 1136
 * - >8h：1136 + 第9–10h×190 + 第11–12h×237
 */
export function calculateHolidayDayPay(totalWorkHours: number): Omit<
  HolidayDayPayDetail,
  "date" | "holidayName" | "totalWorkHours" | "hasClockIn"
> {
  const doublePay = CLINIC_PAYROLL.HOLIDAY_DOUBLE_PAY;
  const tier1Rate = CLINIC_PAYROLL.HOLIDAY_OT_TIER1_HOURLY;
  const tier2Rate = CLINIC_PAYROLL.HOLIDAY_OT_TIER2_HOURLY;

  if (totalWorkHours <= HOLIDAY_BASE_HOURS) {
    return {
      scenario: "A",
      doublePay,
      overtimePay: 0,
      overtimeHoursTier1: 0,
      overtimeHoursTier2: 0,
      overtimeTier1Rate: tier1Rate,
      overtimeTier2Rate: tier2Rate,
      totalPay: doublePay,
    };
  }

  const excess = totalWorkHours - HOLIDAY_BASE_HOURS;
  const overtimeHoursTier1 = Math.min(excess, 2);
  const overtimeHoursTier2 = Math.min(Math.max(excess - 2, 0), 2);
  const overtimePay =
    Math.round(overtimeHoursTier1 * tier1Rate) +
    Math.round(overtimeHoursTier2 * tier2Rate);

  return {
    scenario: "B",
    doublePay,
    overtimePay,
    overtimeHoursTier1: roundHours(overtimeHoursTier1),
    overtimeHoursTier2: roundHours(overtimeHoursTier2),
    overtimeTier1Rate: tier1Rate,
    overtimeTier2Rate: tier2Rate,
    totalPay: doublePay + overtimePay,
  };
}

/** 解析當月國定假日日期（行政院假日 + 班表額外標記 − 全天休診日） */
export function resolveHolidayDates(
  periodStart: string,
  periodEnd: string,
  scheduleMarkedHolidays: string[] = [],
  closureDates: string[] = []
): Set<string> {
  const closureSet = new Set(closureDates);
  const dates = new Set<string>();

  let cursor = periodStart;
  while (cursor <= periodEnd) {
    if (!closureSet.has(cursor)) {
      if (isTaiwanPublicHoliday(cursor) || scheduleMarkedHolidays.includes(cursor)) {
        dates.add(cursor);
      }
    }
    cursor = addDays(cursor, 1);
  }

  return dates;
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T12:00:00+08:00`);
  d.setTime(d.getTime() + days * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/**
 * 國定假日出勤計薪：班表標記為國定假日 + 當日有上班打卡
 */
export function calculateHolidayAttendancePay(
  employeeId: string,
  periodStart: string,
  periodEnd: string,
  shifts: WorkShiftBlock[],
  clocks: ClockEvent[],
  context: HolidayPayContext
): HolidayAttendancePayResult {
  const dayDetails: HolidayDayPayDetail[] = [];
  const excludeFromRegularOtDates: string[] = [];

  for (const date of [...context.holidayDates].sort()) {
    if (date < periodStart || date > periodEnd) continue;

    const hasClockIn = clocks.some(
      (c) =>
        c.employeeId === employeeId &&
        c.clockType === "clock_in" &&
        c.clockedAt.startsWith(date)
    );
    if (!hasClockIn) continue;

    const totalWorkHours = computeDayWorkHours(employeeId, date, clocks, shifts);
    if (totalWorkHours <= 0) continue;

    const pay = calculateHolidayDayPay(totalWorkHours);
    dayDetails.push({
      date,
      holidayName: getTaiwanPublicHolidayName(date),
      totalWorkHours,
      hasClockIn: true,
      ...pay,
    });
    excludeFromRegularOtDates.push(date);
  }

  const doublePayTotal = dayDetails.reduce((s, d) => s + d.doublePay, 0);
  const overtimePayTotal = dayDetails.reduce((s, d) => s + d.overtimePay, 0);

  return {
    days: dayDetails.length,
    doublePayTotal,
    overtimePayTotal,
    totalPay: doublePayTotal + overtimePayTotal,
    dates: dayDetails.map((d) => d.date),
    dayDetails,
    excludeFromRegularOtDates,
  };
}

/** @deprecated 使用 calculateHolidayAttendancePay */
export function calculateSpecialAttendance(
  employeeId: string,
  periodStart: string,
  periodEnd: string,
  shifts: WorkShiftBlock[],
  clocks: ClockEvent[],
  context?: HolidayPayContext
): {
  days: number;
  pay: number;
  dates: string[];
  details: { date: string; hasClockIn: boolean; shiftCodes: string[] }[];
} {
  const holidayDates =
    context?.holidayDates ??
    resolveHolidayDates(periodStart, periodEnd, [], []);
  const result = calculateHolidayAttendancePay(
    employeeId,
    periodStart,
    periodEnd,
    shifts,
    clocks,
    { holidayDates }
  );
  return {
    days: result.days,
    pay: result.totalPay,
    dates: result.dates,
    details: result.dayDetails.map((d) => ({
      date: d.date,
      hasClockIn: d.hasClockIn,
      shiftCodes: [],
    })),
  };
}

/** 排除國定假日出勤日，避免與專屬延長工時重複計入一般加班 */
export function summarizeHoursExcludingHolidayWorkDays(
  employeeId: string,
  periodStart: string,
  periodEnd: string,
  shifts: WorkShiftBlock[],
  clocks: ClockEvent[],
  excludeDates: string[]
): { regularHours: number; overtimeHours: number } {
  const exclude = new Set(excludeDates);
  let regularHours = 0;
  let overtimeHours = 0;

  let cursor = periodStart;
  while (cursor <= periodEnd) {
    if (!exclude.has(cursor)) {
      const daily = getDailyHoursSimple(cursor, employeeId, shifts, clocks);
      regularHours += daily.regular;
      overtimeHours += daily.overtime;
    }
    cursor = addDays(cursor, 1);
  }

  return { regularHours, overtimeHours };
}

function getDailyHoursSimple(
  date: string,
  employeeId: string,
  shifts: WorkShiftBlock[],
  clocks: ClockEvent[]
): { regular: number; overtime: number } {
  const OFF = new Set(["STATUTORY", "REST", "ANNUAL_LEAVE", "CLOSED"]);
  const expected = shifts
    .filter(
      (s) =>
        s.date === date &&
        s.employeeId === employeeId &&
        !OFF.has(s.shiftCode)
    )
    .reduce((sum, s) => sum + (s.plannedHours || 0), 0);

  const total = computeDayWorkHours(employeeId, date, clocks, shifts);
  if (total === 0 && expected === 0) return { regular: 0, overtime: 0 };

  const regular = expected > 0 ? Math.min(total, expected) : total;
  const overtime = expected > 0 ? Math.max(0, total - expected) : 0;
  return { regular, overtime };
}
