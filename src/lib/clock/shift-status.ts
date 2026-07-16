import {
  filterWorkAssignments,
  suggestNextClockAction,
  type ExistingClock,
  type WorkAssignment,
} from "@/lib/clock/session";
import { getShiftDisplayName } from "@/lib/clock/shift-labels";

export type ShiftClockPhase = "pending" | "working" | "done";

export interface ShiftClockStatusDetail {
  assignmentId: string;
  shiftCode: string;
  shiftName: string;
  /** 第幾診（依當日排班時間排序，1 起算） */
  sessionIndex: number;
  expectedClockIn: string;
  expectedClockOut: string;
  clockInAt: string | null;
  clockOutAt: string | null;
  clockInLate: boolean;
  clockInLateMinutes: number;
  phase: ShiftClockPhase;
  /** 此診別下一步動作；已完成則 null */
  nextAction: "clock_in" | "clock_out" | null;
  /** 是否為全系統建議的下一個打卡目標 */
  isActive: boolean;
}

export interface ClockRecordForStatus extends ExistingClock {
  is_late?: boolean;
  late_minutes?: number;
}

function findClock(
  clocks: ClockRecordForStatus[],
  assignmentId: string,
  clockType: "clock_in" | "clock_out"
): ClockRecordForStatus | undefined {
  return clocks.find(
    (c) => c.assignment_id === assignmentId && c.clock_type === clockType
  );
}

/** 依排班與打卡紀錄，產生各診別（早／晚／三診…）獨立狀態 */
export function buildShiftClockStatuses(
  assignments: WorkAssignment[],
  clocks: ClockRecordForStatus[]
): ShiftClockStatusDetail[] {
  const work = filterWorkAssignments(assignments);
  const globalNext = suggestNextClockAction(assignments, clocks);

  let activeAssignmentId: string | null = null;
  if (globalNext === "clock_in") {
    activeAssignmentId =
      work.find((a) => !findClock(clocks, a.id, "clock_in"))?.id ?? null;
  } else if (globalNext === "clock_out") {
    activeAssignmentId =
      work.find((a) => {
        const hasIn = !!findClock(clocks, a.id, "clock_in");
        const hasOut = !!findClock(clocks, a.id, "clock_out");
        return hasIn && !hasOut;
      })?.id ?? null;
  }

  return work.map((assignment, index) => {
    const clockIn = findClock(clocks, assignment.id, "clock_in");
    const clockOut = findClock(clocks, assignment.id, "clock_out");

    let phase: ShiftClockPhase = "pending";
    let nextAction: "clock_in" | "clock_out" | null = "clock_in";

    if (clockOut) {
      phase = "done";
      nextAction = null;
    } else if (clockIn) {
      phase = "working";
      nextAction = "clock_out";
    }

    return {
      assignmentId: assignment.id,
      shiftCode: assignment.shift_code,
      shiftName: assignment.shift_name,
      sessionIndex: index + 1,
      expectedClockIn: assignment.expected_clock_in,
      expectedClockOut: assignment.expected_clock_out,
      clockInAt: clockIn?.clocked_at ?? null,
      clockOutAt: clockOut?.clocked_at ?? null,
      clockInLate: !!clockIn?.is_late,
      clockInLateMinutes: clockIn?.late_minutes ?? 0,
      phase,
      nextAction,
      isActive: assignment.id === activeAssignmentId,
    };
  });
}

export function formatClockTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("zh-TW", {
    timeZone: "Asia/Taipei",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatTimeRange(clockIn: string, clockOut: string): string {
  return `${clockIn.slice(0, 5)} – ${clockOut.slice(0, 5)}`;
}

/** 多診時顯示標籤：單診用班別名，多診加序號 */
export function formatSessionLabel(
  detail: Pick<ShiftClockStatusDetail, "shiftCode" | "shiftName" | "sessionIndex">,
  totalSessions: number
): string {
  const name = getShiftDisplayName(detail.shiftCode, detail.shiftName);
  if (totalSessions <= 1) return name;
  return `${name}（第 ${detail.sessionIndex} 診）`;
}

export function phaseLabel(phase: ShiftClockPhase): string {
  if (phase === "done") return "已完成";
  if (phase === "working") return "進行中";
  return "待上班";
}

export function buildShiftStatusSummaryLine(
  detail: ShiftClockStatusDetail,
  totalSessions: number
): string {
  const label = formatSessionLabel(detail, totalSessions);
  const range = formatTimeRange(detail.expectedClockIn, detail.expectedClockOut);
  const inTime = formatClockTime(detail.clockInAt);
  const outTime = formatClockTime(detail.clockOutAt);

  if (detail.phase === "done") {
    return `${label} ${range}｜上班 ${inTime} → 下班 ${outTime} ✓`;
  }
  if (detail.phase === "working") {
    return `${label} ${range}｜上班 ${inTime} ✓ → 下班 ${outTime} 待打`;
  }
  return `${label} ${range}｜上班、下班皆待打卡`;
}
