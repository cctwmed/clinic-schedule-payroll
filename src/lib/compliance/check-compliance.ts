import {
  FLEXIBLE_LABOR,
  getDayOfWeekTaipei,
  getExpectedDailyHours,
  getExpectedWeeklyHours,
  getISOWeek,
  getTrackForEmployeeA,
  isDualClinicDay,
} from "@/lib/shift-templates";
import type {
  ClockEvent,
  ComplianceIssue,
  DayOffRecord,
  WorkShiftBlock,
} from "@/lib/compliance/types";

const {
  CYCLE_DAYS,
  MAX_REGULAR_HOURS_PER_CYCLE,
  MIN_STATUTORY_DAYS_PER_CYCLE,
  MIN_REST_DAYS_PER_CYCLE,
  MIN_REST_BETWEEN_SHIFTS_HOURS,
  BREAK_REMINDER_HOURS,
  HOURS_TOLERANCE,
} = FLEXIBLE_LABOR;

function formatTaipeiDate(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function addDays(dateStr: string, days: number): string {
  const base = new Date(`${dateStr}T12:00:00+08:00`);
  base.setTime(base.getTime() + days * 86_400_000);
  return formatTaipeiDate(base);
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
  const expected = getExpectedDailyFromShifts(date, employeeId, shifts);

  const dayClocks = clocks
    .filter((c) => c.employeeId === employeeId && c.clockedAt.startsWith(date))
    .sort((a, b) => a.clockedAt.localeCompare(b.clockedAt));

  const clockIn = dayClocks.find((c) => c.clockType === "clock_in");
  const clockOut = [...dayClocks].reverse().find((c) => c.clockType === "clock_out");

  let total: number;
  if (clockIn && clockOut) {
    total = hoursBetween(clockOut.clockedAt, clockIn.clockedAt);
  } else {
    total = expected;
  }

  const regular = Math.min(total, expected > 0 ? expected : total);
  const overtime = expected > 0 ? Math.max(0, total - expected - HOURS_TOLERANCE) : 0;

  return { regular, total, overtime, expected };
}

function checkWeeklyGoldenHours(
  employeeId: string,
  employeeName: string | undefined,
  periodStart: string,
  periodEnd: string,
  shifts: WorkShiftBlock[],
  clocks: ClockEvent[],
  isEmployeeA: boolean,
  oddWeekTrackForA: 1 | 2 = 1
): ComplianceIssue[] {
  const issues: ComplianceIssue[] = [];
  const weekMap = new Map<number, string[]>();

  let cursor = periodStart;
  while (cursor <= periodEnd) {
    const wk = getISOWeek(cursor);
    if (!weekMap.has(wk)) weekMap.set(wk, []);
    weekMap.get(wk)!.push(cursor);
    cursor = addDays(cursor, 1);
  }

  for (const [weekNum, dates] of weekMap) {
    let expectedSum = 0;
    let actualSum = 0;

    for (const date of dates) {
      expectedSum += getExpectedDailyFromShifts(date, employeeId, shifts);
      actualSum += getDailyHours(date, employeeId, shifts, clocks).total;
    }

    const sampleDate = dates[0];
    const track = isEmployeeA
      ? getTrackForEmployeeA(sampleDate, oddWeekTrackForA)
      : getTrackForEmployeeA(sampleDate, oddWeekTrackForA) === 1
        ? 2
        : 1;
    const trackBaseline = getExpectedWeeklyHours(track);

    if (actualSum > expectedSum + HOURS_TOLERANCE) {
      issues.push({
        ruleCode: "WEEKLY_OVERTIME",
        severity: "violation",
        message: `${employeeName ?? "員工"} 第 ${weekNum} 週實際 ${actualSum.toFixed(1)} 小時，超過排班基準 ${expectedSum.toFixed(1)} 小時（軌道${track} 基準 ${trackBaseline}h）`,
        employeeId,
        employeeName,
        date: sampleDate,
        actualValue: actualSum,
        thresholdValue: expectedSum,
        unit: "hours",
      });
    } else if (expectedSum > 0 && Math.abs(expectedSum - trackBaseline) > 1.5) {
      issues.push({
        ruleCode: "WEEKLY_HOURS_MISMATCH",
        severity: "warning",
        message: `${employeeName ?? "員工"} 第 ${weekNum} 週排班 ${expectedSum.toFixed(1)} 小時，與軌道${track} 基準 ${trackBaseline} 小時偏差較大`,
        employeeId,
        employeeName,
        date: sampleDate,
        actualValue: expectedSum,
        thresholdValue: trackBaseline,
        unit: "hours",
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
  let cursor = periodStart;

  while (cursor <= periodEnd) {
    const windowEnd = addDays(cursor, CYCLE_DAYS - 1);
    if (windowEnd > periodEnd) break;

    const windowOffs = dayOffs.filter(
      (d) => d.employeeId === employeeId && d.date >= cursor && d.date <= windowEnd
    );

    const dates = new Set(
      shifts
        .filter((s) => s.employeeId === employeeId && s.date >= cursor && s.date <= windowEnd)
        .map((s) => s.date)
    );

    if (dates.size === 0 && windowOffs.length === 0) {
      cursor = addDays(cursor, CYCLE_DAYS);
      continue;
    }

    let regularTotal = 0;
    for (const date of dates) {
      regularTotal += getDailyHours(date, employeeId, shifts, clocks).regular;
    }

    if (regularTotal > MAX_REGULAR_HOURS_PER_CYCLE) {
      issues.push({
        ruleCode: "FOUR_WEEK_TOTAL_HOURS",
        severity: "violation",
        message: `${employeeName ?? "員工"} ${cursor}～${windowEnd} 四週工時 ${regularTotal.toFixed(1)}h，超過 ${MAX_REGULAR_HOURS_PER_CYCLE}h`,
        employeeId,
        employeeName,
        date: cursor,
        actualValue: regularTotal,
        thresholdValue: MAX_REGULAR_HOURS_PER_CYCLE,
        unit: "hours",
      });
    }

    const statutoryCount = windowOffs.filter((d) => d.type === "statutory").length;
    if (statutoryCount < MIN_STATUTORY_DAYS_PER_CYCLE) {
      issues.push({
        ruleCode: "STATUTORY_DAYS",
        severity: "warning",
        message: `${employeeName ?? "員工"} ${cursor}～${windowEnd} 僅 ${statutoryCount} 天例假`,
        employeeId,
        employeeName,
        date: cursor,
        actualValue: statutoryCount,
        thresholdValue: MIN_STATUTORY_DAYS_PER_CYCLE,
        unit: "days",
      });
    }

    const restCount = windowOffs.filter((d) => d.type === "rest").length;
    if (restCount < MIN_REST_DAYS_PER_CYCLE) {
      issues.push({
        ruleCode: "REST_DAYS",
        severity: "warning",
        message: `${employeeName ?? "員工"} ${cursor}～${windowEnd} 僅 ${restCount} 天休息日`,
        employeeId,
        employeeName,
        date: cursor,
        actualValue: restCount,
        thresholdValue: MIN_REST_DAYS_PER_CYCLE,
        unit: "days",
      });
    }

    cursor = addDays(cursor, CYCLE_DAYS);
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
    .filter((s) => s.employeeId === employeeId && !["STATUTORY", "REST", "ANNUAL_LEAVE"].includes(s.shiftCode))
    .sort((a, b) => {
      const cmp = a.date.localeCompare(b.date);
      if (cmp !== 0) return cmp;
      return a.expectedStart.localeCompare(b.expectedStart);
    });

  for (let i = 1; i < empShifts.length; i++) {
    const prev = empShifts[i - 1];
    const curr = empShifts[i];
    const prevEnd = combineDateTime(prev.date, prev.expectedEnd);
    const currStart = combineDateTime(curr.date, curr.expectedStart);
    const restHours = (currStart.getTime() - prevEnd.getTime()) / (1000 * 60 * 60);

    if (restHours < MIN_REST_BETWEEN_SHIFTS_HOURS) {
      issues.push({
        ruleCode: "REST_BETWEEN_SHIFTS",
        severity: "violation",
        message: `${employeeName ?? "員工"} 班間休息僅 ${restHours.toFixed(1)}h，需 ≥ ${MIN_REST_BETWEEN_SHIFTS_HOURS}h`,
        employeeId,
        employeeName,
        date: curr.date,
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

export function checkCompliance(input: CheckComplianceInput): ComplianceIssue[] {
  const {
    periodStart,
    periodEnd,
    shifts,
    dayOffs,
    clocks,
    employeeIds,
    employeeAId,
    oddWeekTrackForA = 1,
  } = input;

  if (shifts.length === 0 && dayOffs.length === 0) {
    return [];
  }

  const allIssues: ComplianceIssue[] = [];

  for (const emp of employeeIds) {
    const isA = employeeAId ? emp.id === employeeAId : false;
    allIssues.push(
      ...checkFourWeekWindows(emp.id, emp.name, periodStart, periodEnd, shifts, dayOffs, clocks),
      ...checkWeeklyGoldenHours(
        emp.id,
        emp.name,
        periodStart,
        periodEnd,
        shifts,
        clocks,
        isA,
        oddWeekTrackForA
      ),
      ...checkDailyOvertime(emp.id, emp.name, shifts, clocks),
      ...checkRestBetweenShifts(emp.id, emp.name, shifts),
      ...checkBreakReminders(emp.id, emp.name, clocks)
    );
  }

  const seen = new Set<string>();
  return allIssues.filter((issue) => {
    const key = `${issue.ruleCode}-${issue.employeeId}-${issue.date}-${issue.message}`;
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
