export type ClockType = "clock_in" | "clock_out" | "break_start" | "break_end";

export interface WorkAssignment {
  id: string;
  expected_clock_in: string;
  expected_clock_out: string;
  shift_code: string;
  shift_name: string;
}

export interface ExistingClock {
  id: string;
  assignment_id: string | null;
  clock_type: ClockType;
  clocked_at: string;
}

export interface ClockMatchResult {
  assignmentId: string | null;
  expectedAt: string | null;
  isLate: boolean;
  lateMinutes: number;
  shiftLabel: string | null;
}

const OFF_SHIFT_CODES = new Set(["STATUTORY", "REST", "ANNUAL_LEAVE", "CLOSED"]);

/** 無當日排班時，上班打卡遲到的預設基準（早診到班） */
export const DEFAULT_CLOCK_IN_TIME = "08:20";

/** 台北時區的 YYYY-MM-DD 與 HH:MM → ISO 字串 */
export function toTaipeiDateTime(workDate: string, time: string): Date {
  const normalized = time.length >= 5 ? time.slice(0, 5) : time;
  return new Date(`${workDate}T${normalized}:00+08:00`);
}

export function getTaipeiTimeParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    time: `${get("hour")}:${get("minute")}:${get("second")}`,
  };
}

export function isWorkAssignment(shiftCode: string | undefined): boolean {
  if (!shiftCode) return false;
  return !OFF_SHIFT_CODES.has(shiftCode);
}

export function filterWorkAssignments(assignments: WorkAssignment[]): WorkAssignment[] {
  return assignments
    .filter((a) => isWorkAssignment(a.shift_code))
    .sort((a, b) => a.expected_clock_in.localeCompare(b.expected_clock_in));
}

function hasClockForAssignment(
  clocks: ExistingClock[],
  assignmentId: string,
  clockType: ClockType
): boolean {
  return clocks.some(
    (c) => c.assignment_id === assignmentId && c.clock_type === clockType
  );
}

export function resolveClockInAssignment(
  workDate: string,
  assignments: WorkAssignment[],
  clocks: ExistingClock[],
  clockedAt: Date
): ClockMatchResult {
  const work = filterWorkAssignments(assignments);
  const target = work.find((a) => !hasClockForAssignment(clocks, a.id, "clock_in"));

  if (!target) {
    return {
      assignmentId: null,
      expectedAt: null,
      isLate: false,
      lateMinutes: 0,
      shiftLabel: null,
    };
  }

  const expectedAt = toTaipeiDateTime(workDate, target.expected_clock_in);
  const isLate = clockedAt > expectedAt;
  const lateMinutes = isLate
    ? Math.max(0, Math.floor((clockedAt.getTime() - expectedAt.getTime()) / 60000))
    : 0;

  return {
    assignmentId: target.id,
    expectedAt: expectedAt.toISOString(),
    isLate,
    lateMinutes,
    shiftLabel: `${target.shift_name} ${target.expected_clock_in.slice(0, 5)}`,
  };
}

/** 當日無排班時，以診所預設早診到班時間（08:20）判斷遲到 */
export function resolveDefaultClockInLate(
  workDate: string,
  clockedAt: Date
): ClockMatchResult {
  const expectedAt = toTaipeiDateTime(workDate, DEFAULT_CLOCK_IN_TIME);
  const isLate = clockedAt > expectedAt;
  const lateMinutes = isLate
    ? Math.max(0, Math.floor((clockedAt.getTime() - expectedAt.getTime()) / 60000))
    : 0;

  return {
    assignmentId: null,
    expectedAt: expectedAt.toISOString(),
    isLate,
    lateMinutes,
    shiftLabel: `預設早診 ${DEFAULT_CLOCK_IN_TIME}`,
  };
}

export function resolveClockOutAssignment(
  assignments: WorkAssignment[],
  clocks: ExistingClock[]
): ClockMatchResult {
  const work = filterWorkAssignments(assignments);

  for (const assignment of work) {
    const hasIn = hasClockForAssignment(clocks, assignment.id, "clock_in");
    const hasOut = hasClockForAssignment(clocks, assignment.id, "clock_out");
    if (hasIn && !hasOut) {
      return {
        assignmentId: assignment.id,
        expectedAt: null,
        isLate: false,
        lateMinutes: 0,
        shiftLabel: `${assignment.shift_name} ${assignment.expected_clock_out.slice(0, 5)}`,
      };
    }
  }

  return {
    assignmentId: work[0]?.id ?? null,
    expectedAt: null,
    isLate: false,
    lateMinutes: 0,
    shiftLabel: work[0]?.shift_name ?? null,
  };
}

export function evaluateLateForManualCorrection(
  workDate: string,
  clockType: ClockType,
  clockedAt: Date,
  assignment: WorkAssignment | null
): { isLate: boolean; lateMinutes: number; expectedAt: string | null } {
  if (clockType !== "clock_in") {
    return { isLate: false, lateMinutes: 0, expectedAt: null };
  }

  const expectedIn = assignment?.expected_clock_in ?? DEFAULT_CLOCK_IN_TIME;
  const expectedAt = toTaipeiDateTime(workDate, expectedIn);
  const isLate = clockedAt > expectedAt;
  const lateMinutes = isLate
    ? Math.max(0, Math.floor((clockedAt.getTime() - expectedAt.getTime()) / 60000))
    : 0;

  return {
    isLate,
    lateMinutes,
    expectedAt: expectedAt.toISOString(),
  };
}

export function suggestNextClockAction(
  assignments: WorkAssignment[],
  clocks: ExistingClock[]
): "clock_in" | "clock_out" | "done" {
  const work = filterWorkAssignments(assignments);
  for (const a of work) {
    if (!hasClockForAssignment(clocks, a.id, "clock_in")) return "clock_in";
  }
  for (const a of work) {
    if (
      hasClockForAssignment(clocks, a.id, "clock_in") &&
      !hasClockForAssignment(clocks, a.id, "clock_out")
    ) {
      return "clock_out";
    }
  }
  return "done";
}
