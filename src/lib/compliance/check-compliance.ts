import { resolvePayableClockIn } from "@/lib/clock/early-punch";
import {
  FLEXIBLE_LABOR,
  addDaysTaipei,
  getDayOfWeekTaipei,
  getExpectedDailyHours,
  isDualClinicDay,
  iterateFixedCycles,
} from "@/lib/shift-templates";
import type {
  ClockEvent,
  ComplianceIssue,
  DayOffRecord,
  WorkShiftBlock,
} from "@/lib/compliance/types";

const {
  CYCLE_DAYS,
  TWO_WEEK_DAYS,
  MAX_REGULAR_HOURS_PER_CYCLE,
  MIN_STATUTORY_DAYS_PER_TWO_WEEKS,
  MIN_STATUTORY_DAYS_PER_CYCLE,
  MIN_REST_DAYS_PER_CYCLE,
  MIN_OFF_DAYS_PER_CYCLE,
  MAX_CONSECUTIVE_WORK_DAYS,
  MIN_REST_BETWEEN_SHIFTS_HOURS,
  BREAK_REMINDER_HOURS,
  HOURS_TOLERANCE,
} = FLEXIBLE_LABOR;

const NON_WORK_SHIFT_CODES = new Set([
  "STATUTORY",
  "REST",
  "ANNUAL_LEAVE",
  "CLOSED",
]);

function addDays(dateStr: string, days: number): string {
  return addDaysTaipei(dateStr, days);
}

function hoursBetween(endIso: string, startIso: string): number {
  return (new Date(endIso).getTime() - new Date(startIso).getTime()) / (1000 * 60 * 60);
}

function combineDateTime(date: string, time: string): Date {
  return new Date(`${date}T${time.slice(0, 8)}+08:00`);
}

function getEmployeeDayShifts(
  date: string,
  employeeId: string,
  shifts: WorkShiftBlock[]
): WorkShiftBlock[] {
  return shifts.filter(
    (s) =>
      s.date === date &&
      s.employeeId === employeeId &&
      !["STATUTORY", "REST", "ANNUAL_LEAVE", "CLOSED"].includes(s.shiftCode)
  );
}

function getExpectedDailyFromShifts(
  date: string,
  employeeId: string,
  shifts: WorkShiftBlock[]
): number {
  const dayShifts = getEmployeeDayShifts(date, employeeId, shifts);
  if (dayShifts.length === 0) return 0;
  const codes = dayShifts.map((s) => s.shiftCode);
  const fromCodes = getExpectedDailyHours(date, codes);
  if (fromCodes > 0) return fromCodes;
  return dayShifts.reduce((sum, s) => sum + s.plannedHours, 0);
}

function getDailyHours(
  date: string,
  employeeId: string,
  shifts: WorkShiftBlock[],
  clocks: ClockEvent[]
): { regular: number; total: number; overtime: number; expected: number } {
  const closureCredit = shifts
    .filter((s) => s.date === date && s.employeeId === employeeId && s.shiftCode === "CLOSED")
    .reduce((sum, s) => sum + s.plannedHours, 0);

  const expected = getExpectedDailyFromShifts(date, employeeId, shifts);

  const dayClocks = clocks
    .filter((c) => c.employeeId === employeeId && c.clockedAt.startsWith(date))
    .sort((a, b) => a.clockedAt.localeCompare(b.clockedAt));

  const clockIn = dayClocks.find((c) => c.clockType === "clock_in");
  const clockOut = [...dayClocks].reverse().find((c) => c.clockType === "clock_out");

  if (closureCredit > 0 && !clockIn && !clockOut) {
    return {
      regular: closureCredit,
      total: closureCredit,
      overtime: 0,
      expected: closureCredit,
    };
  }

  let total: number;
  if (clockIn && clockOut) {
    const payableIn = resolvePayableClockIn(
      clockIn.clockedAt,
      clockIn.payableClockedAt,
      clockIn.earlyWorkApproved
    );
    total = hoursBetween(clockOut.clockedAt, payableIn);
  } else {
    total = expected;
  }

  const regular = Math.min(total, expected > 0 ? expected : total);
  const overtime = expected > 0 ? Math.max(0, total - expected - HOURS_TOLERANCE) : 0;

  return { regular, total, overtime, expected };
}

function isWorkDay(
  date: string,
  employeeId: string,
  shifts: WorkShiftBlock[]
): boolean {
  return shifts.some(
    (s) =>
      s.date === date &&
      s.employeeId === employeeId &&
      !NON_WORK_SHIFT_CODES.has(s.shiftCode)
  );
}

/** 該員工在週期內是否有任何班表／假別資料（避免空窗誤報） */
function hasScheduleActivityInWindow(
  employeeId: string,
  windowStart: string,
  windowEnd: string,
  shifts: WorkShiftBlock[],
  dayOffs: DayOffRecord[]
): boolean {
  return (
    shifts.some(
      (s) =>
        s.employeeId === employeeId && s.date >= windowStart && s.date <= windowEnd
    ) ||
    dayOffs.some(
      (d) =>
        d.employeeId === employeeId && d.date >= windowStart && d.date <= windowEnd
    )
  );
}

function checkConsecutiveWorkDays(
  employeeId: string,
  employeeName: string | undefined,
  periodStart: string,
  periodEnd: string,
  shifts: WorkShiftBlock[]
): ComplianceIssue[] {
  const issues: ComplianceIssue[] = [];
  let streak = 0;
  let streakStart: string | null = null;

  let cursor = periodStart;
  while (cursor <= periodEnd) {
    if (isWorkDay(cursor, employeeId, shifts)) {
      if (streak === 0) streakStart = cursor;
      streak++;
      if (streak === MAX_CONSECUTIVE_WORK_DAYS + 1) {
        issues.push({
          ruleCode: "MAX_CONSECUTIVE_WORK_DAYS",
          severity: "violation",
          message: `${employeeName ?? "員工"} ${streakStart}～${cursor} 連續工作 ${streak} 天，超過四週變形工時 ${MAX_CONSECUTIVE_WORK_DAYS} 天上限（最長可連上 12 天）`,
          employeeId,
          employeeName,
          date: cursor,
          actualValue: streak,
          thresholdValue: MAX_CONSECUTIVE_WORK_DAYS,
          unit: "days",
        });
      }
    } else {
      streak = 0;
      streakStart = null;
    }
    cursor = addDays(cursor, 1);
  }

  return issues;
}

/**
 * 固定 2 週（14 日）週期：至少 2 天例假。
 * 例假可於 2 週內調移；禁止用滾動日窗卡死合法班表。
 */
function checkTwoWeekStatutoryWindows(
  employeeId: string,
  employeeName: string | undefined,
  periodStart: string,
  periodEnd: string,
  dayOffs: DayOffRecord[],
  shifts: WorkShiftBlock[]
): ComplianceIssue[] {
  const issues: ComplianceIssue[] = [];

  for (const { start, end } of iterateFixedCycles(
    periodStart,
    periodEnd,
    TWO_WEEK_DAYS
  )) {
    // 僅檢查資料完整涵蓋的固定週期
    if (start < periodStart || end > periodEnd) continue;
    if (!hasScheduleActivityInWindow(employeeId, start, end, shifts, dayOffs)) {
      continue;
    }

    const statutoryCount = dayOffs.filter(
      (d) =>
        d.employeeId === employeeId &&
        d.type === "statutory" &&
        d.date >= start &&
        d.date <= end
    ).length;

    if (statutoryCount < MIN_STATUTORY_DAYS_PER_TWO_WEEKS) {
      issues.push({
        ruleCode: "STATUTORY_DAYS_TWO_WEEKS",
        severity: "violation",
        message: `${employeeName ?? "員工"} 固定兩週週期 ${start}～${end} 僅 ${statutoryCount} 天例假（不可出勤），依法需 ≥ ${MIN_STATUTORY_DAYS_PER_TWO_WEEKS} 天`,
        employeeId,
        employeeName,
        date: start,
        windowEnd: end,
        actualValue: statutoryCount,
        thresholdValue: MIN_STATUTORY_DAYS_PER_TWO_WEEKS,
        unit: "days",
      });
    }
  }

  return issues;
}

function checkDailyOvertime(
  employeeId: string,
  employeeName: string | undefined,
  shifts: WorkShiftBlock[],
  clocks: ClockEvent[]
): ComplianceIssue[] {
  const issues: ComplianceIssue[] = [];
  const dates = [...new Set(shifts.filter((s) => s.employeeId === employeeId).map((s) => s.date))];

  for (const date of dates) {
    const { total, expected, overtime } = getDailyHours(date, employeeId, shifts, clocks);
    const dow = getDayOfWeekTaipei(date);

    if (overtime > 0) {
      issues.push({
        ruleCode: "DAILY_OVERTIME",
        severity: "violation",
        message: `${employeeName ?? "員工"} ${date} 工時 ${total.toFixed(1)} 小時，超過正常基準 ${expected.toFixed(1)} 小時（${isDualClinicDay(dow) ? "雙診 7.67h" : "半日 3.67h"}）`,
        employeeId,
        employeeName,
        date,
        actualValue: total,
        thresholdValue: expected,
        unit: "hours",
      });
    }

    if (total > 12 + HOURS_TOLERANCE) {
      issues.push({
        ruleCode: "DAILY_ABSOLUTE_MAX",
        severity: "violation",
        message: `${employeeName ?? "員工"} ${date} 總工時 ${total.toFixed(1)} 小時，超過單日 12 小時上限`,
        employeeId,
        employeeName,
        date,
        actualValue: total,
        thresholdValue: 12,
        unit: "hours",
      });
    }
  }

  return issues;
}

/**
 * 固定 4 週（28 日）週期：工時 ≤160h；例假 ≥4、休息日 ≥4、合計 ≥8。
 */
function checkFourWeekWindows(
  employeeId: string,
  employeeName: string | undefined,
  periodStart: string,
  periodEnd: string,
  shifts: WorkShiftBlock[],
  dayOffs: DayOffRecord[],
  clocks: ClockEvent[]
): ComplianceIssue[] {
  const issues: ComplianceIssue[] = [];

  for (const { start, end } of iterateFixedCycles(periodStart, periodEnd, CYCLE_DAYS)) {
    if (start < periodStart || end > periodEnd) continue;
    if (!hasScheduleActivityInWindow(employeeId, start, end, shifts, dayOffs)) {
      continue;
    }

    const windowOffs = dayOffs.filter(
      (d) => d.employeeId === employeeId && d.date >= start && d.date <= end
    );

    const dates = new Set(
      shifts
        .filter((s) => s.employeeId === employeeId && s.date >= start && s.date <= end)
        .map((s) => s.date)
    );

    let regularTotal = 0;
    for (const date of dates) {
      regularTotal += getDailyHours(date, employeeId, shifts, clocks).regular;
    }

    if (regularTotal > MAX_REGULAR_HOURS_PER_CYCLE) {
      issues.push({
        ruleCode: "FOUR_WEEK_TOTAL_HOURS",
        severity: "violation",
        message: `${employeeName ?? "員工"} 固定四週週期 ${start}～${end} 工時 ${regularTotal.toFixed(1)}h，超過 ${MAX_REGULAR_HOURS_PER_CYCLE}h`,
        employeeId,
        employeeName,
        date: start,
        windowEnd: end,
        actualValue: regularTotal,
        thresholdValue: MAX_REGULAR_HOURS_PER_CYCLE,
        unit: "hours",
      });
    }

    const statutoryCount = windowOffs.filter((d) => d.type === "statutory").length;
    const restCount = windowOffs.filter((d) => d.type === "rest").length;
    const offDaysTotal = statutoryCount + restCount;

    if (statutoryCount < MIN_STATUTORY_DAYS_PER_CYCLE) {
      issues.push({
        ruleCode: "STATUTORY_DAYS_FOUR_WEEKS",
        severity: "warning",
        message: `${employeeName ?? "員工"} 固定四週週期 ${start}～${end} 僅 ${statutoryCount} 天例假，需 ≥ ${MIN_STATUTORY_DAYS_PER_CYCLE} 天`,
        employeeId,
        employeeName,
        date: start,
        windowEnd: end,
        actualValue: statutoryCount,
        thresholdValue: MIN_STATUTORY_DAYS_PER_CYCLE,
        unit: "days",
      });
    }

    if (restCount < MIN_REST_DAYS_PER_CYCLE) {
      issues.push({
        ruleCode: "REST_DAYS_FOUR_WEEKS",
        severity: "warning",
        message: `${employeeName ?? "員工"} 固定四週週期 ${start}～${end} 僅 ${restCount} 天休息日，需 ≥ ${MIN_REST_DAYS_PER_CYCLE} 天`,
        employeeId,
        employeeName,
        date: start,
        windowEnd: end,
        actualValue: restCount,
        thresholdValue: MIN_REST_DAYS_PER_CYCLE,
        unit: "days",
      });
    }

    if (offDaysTotal < MIN_OFF_DAYS_PER_CYCLE) {
      issues.push({
        ruleCode: "OFF_DAYS",
        severity: "warning",
        message: `${employeeName ?? "員工"} 固定四週週期 ${start}～${end} 例假+休息僅 ${offDaysTotal} 天（例假 ${statutoryCount}、休息 ${restCount}），需 ≥ ${MIN_OFF_DAYS_PER_CYCLE} 天`,
        employeeId,
        employeeName,
        date: start,
        windowEnd: end,
        actualValue: offDaysTotal,
        thresholdValue: MIN_OFF_DAYS_PER_CYCLE,
        unit: "days",
      });
    }
  }

  return issues;
}

function checkRestBetweenShifts(
  employeeId: string,
  employeeName: string | undefined,
  shifts: WorkShiftBlock[]
): ComplianceIssue[] {
  const issues: ComplianceIssue[] = [];
  const empShifts = shifts
    .filter(
      (s) =>
        s.employeeId === employeeId &&
        !["STATUTORY", "REST", "ANNUAL_LEAVE"].includes(s.shiftCode)
    )
    .sort((a, b) => {
      const cmp = a.date.localeCompare(b.date);
      if (cmp !== 0) return cmp;
      return a.expectedStart.localeCompare(b.expectedStart);
    });

  const byDate = new Map<string, WorkShiftBlock[]>();
  for (const shift of empShifts) {
    const dayShifts = byDate.get(shift.date) ?? [];
    dayShifts.push(shift);
    byDate.set(shift.date, dayShifts);
  }

  const sortedDates = [...byDate.keys()].sort();
  for (let i = 1; i < sortedDates.length; i++) {
    const prevDate = sortedDates[i - 1];
    const currDate = sortedDates[i];
    if (prevDate === currDate) continue;

    const prevDayShifts = byDate.get(prevDate)!;
    const currDayShifts = byDate.get(currDate)!;
    const lastShift = prevDayShifts[prevDayShifts.length - 1];
    const firstShift = currDayShifts[0];

    const prevEnd = combineDateTime(lastShift.date, lastShift.expectedEnd);
    const currStart = combineDateTime(firstShift.date, firstShift.expectedStart);
    const restHours =
      (currStart.getTime() - prevEnd.getTime()) / (1000 * 60 * 60);

    if (restHours < MIN_REST_BETWEEN_SHIFTS_HOURS) {
      issues.push({
        ruleCode: "REST_BETWEEN_SHIFTS",
        severity: "violation",
        message: `${employeeName ?? "員工"} ${prevDate} 末班至 ${currDate} 首班間休息僅 ${restHours.toFixed(1)}h，需 ≥ ${MIN_REST_BETWEEN_SHIFTS_HOURS}h`,
        employeeId,
        employeeName,
        date: currDate,
        actualValue: restHours,
        thresholdValue: MIN_REST_BETWEEN_SHIFTS_HOURS,
        unit: "hours",
      });
    }
  }

  return issues;
}

function checkBreakReminders(
  employeeId: string,
  employeeName: string | undefined,
  clocks: ClockEvent[]
): ComplianceIssue[] {
  const issues: ComplianceIssue[] = [];
  const empClocks = clocks
    .filter((c) => c.employeeId === employeeId)
    .sort((a, b) => a.clockedAt.localeCompare(b.clockedAt));

  const lastIn = empClocks.filter((c) => c.clockType === "clock_in").at(-1);
  if (!lastIn) return issues;

  const hasBreak = empClocks.some(
    (c) =>
      c.clockType === "break_start" &&
      c.clockedAt > lastIn.clockedAt &&
      hoursBetween(c.clockedAt, lastIn.clockedAt) <= BREAK_REMINDER_HOURS + 0.5
  );
  const hasOut = empClocks.some(
    (c) => c.clockType === "clock_out" && c.clockedAt > lastIn.clockedAt
  );

  const worked = hoursBetween(new Date().toISOString(), lastIn.clockedAt);
  if (worked >= BREAK_REMINDER_HOURS && !hasBreak && !hasOut) {
    issues.push({
      ruleCode: "BREAK_EVERY_4H",
      severity: "warning",
      message: `${employeeName ?? "員工"} 已連續工作 ${worked.toFixed(1)} 小時，請休息 30 分鐘`,
      employeeId,
      employeeName,
      actualValue: worked,
      thresholdValue: BREAK_REMINDER_HOURS,
      unit: "hours",
    });
  }

  return issues;
}

export interface CheckComplianceInput {
  periodStart: string;
  periodEnd: string;
  shifts: WorkShiftBlock[];
  dayOffs: DayOffRecord[];
  clocks: ClockEvent[];
  employeeIds: { id: string; name: string }[];
  employeeAId?: string;
  oddWeekTrackForA?: 1 | 2;
}

function checkOffDayWorkConflicts(
  employeeId: string,
  employeeName: string,
  shifts: WorkShiftBlock[],
  dayOffs: DayOffRecord[]
): ComplianceIssue[] {
  const offDates = new Set(
    dayOffs.filter((d) => d.employeeId === employeeId).map((d) => d.date)
  );
  const issues: ComplianceIssue[] = [];
  const seen = new Set<string>();

  for (const s of shifts) {
    if (s.employeeId !== employeeId) continue;
    if (["STATUTORY", "REST", "ANNUAL_LEAVE", "CLOSED"].includes(s.shiftCode)) continue;
    if (!offDates.has(s.date)) continue;
    const key = `${s.date}-${s.shiftCode}`;
    if (seen.has(key)) continue;
    seen.add(key);
    issues.push({
      ruleCode: "OFF_DAY_WORK_CONFLICT",
      employeeId,
      employeeName,
      date: s.date,
      severity: "violation",
      message: `${employeeName} 於 ${s.date} 同時排了例假/休息日與 ${s.shiftName ?? s.shiftCode}，請修正其中一項`,
    });
  }

  return issues;
}

/** 預警是否與指定月份區間重疊（固定週期用 windowEnd） */
export function complianceIssueOverlapsRange(
  issue: ComplianceIssue,
  rangeStart: string,
  rangeEnd: string
): boolean {
  if (!issue.date) return true;
  const windowStart = issue.date;
  const windowEnd = issue.windowEnd ?? issue.date;
  return windowStart <= rangeEnd && windowEnd >= rangeStart;
}

export function checkCompliance(input: CheckComplianceInput): ComplianceIssue[] {
  const { periodStart, periodEnd, shifts, dayOffs, clocks, employeeIds } = input;

  if (shifts.length === 0 && dayOffs.length === 0) {
    return [];
  }

  const allIssues: ComplianceIssue[] = [];

  for (const emp of employeeIds) {
    allIssues.push(
      ...checkFourWeekWindows(
        emp.id,
        emp.name,
        periodStart,
        periodEnd,
        shifts,
        dayOffs,
        clocks
      ),
      ...checkTwoWeekStatutoryWindows(
        emp.id,
        emp.name,
        periodStart,
        periodEnd,
        dayOffs,
        shifts
      ),
      ...checkConsecutiveWorkDays(emp.id, emp.name, periodStart, periodEnd, shifts),
      ...checkDailyOvertime(emp.id, emp.name, shifts, clocks),
      ...checkRestBetweenShifts(emp.id, emp.name, shifts),
      ...checkBreakReminders(emp.id, emp.name, clocks),
      ...checkOffDayWorkConflicts(emp.id, emp.name, shifts, dayOffs)
    );
  }

  const seen = new Set<string>();
  return allIssues.filter((issue) => {
    const key = `${issue.ruleCode}-${issue.employeeId}-${issue.date}-${issue.windowEnd ?? ""}-${issue.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function summarizeEmployeeHours(
  employeeId: string,
  periodStart: string,
  periodEnd: string,
  shifts: WorkShiftBlock[],
  clocks: ClockEvent[]
) {
  let regularHours = 0;
  let overtimeHours = 0;
  let totalHours = 0;

  let cursor = periodStart;
  while (cursor <= periodEnd) {
    const daily = getDailyHours(cursor, employeeId, shifts, clocks);
    regularHours += daily.expected > 0 ? Math.min(daily.total, daily.expected) : daily.total;
    overtimeHours += daily.overtime;
    totalHours += daily.total;
    cursor = addDays(cursor, 1);
  }

  return { regularHours, overtimeHours, totalHours };
}
