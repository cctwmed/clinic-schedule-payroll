import { filterWorkAssignments, type ExistingClock, type WorkAssignment } from "@/lib/clock/session";
import type { ShiftClockStatusDetail } from "@/lib/clock/shift-status";

export const FORGETFUL_BUFFER_HOURS = 2.5;

export interface ClockReminder {
  type: "missed_clock_in" | "missed_clock_out" | "stale_clock_out";
  severity: "error" | "warning";
  message: string;
  assignmentId?: string;
  shiftName?: string;
  workDate?: string;
}

function parseTaipeiNow(): Date {
  return new Date();
}

function toTaipeiDateTime(dateStr: string, time: string): Date {
  const t = time.length >= 5 ? time.slice(0, 5) : time;
  return new Date(`${dateStr}T${t}:00+08:00`);
}

function hoursAfter(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * 3_600_000);
}

/** 2.5 小時緩衝：漏上班 / 漏下班 / 跨日未下班 */
export function evaluateClockReminders(
  today: string,
  todayAssignments: WorkAssignment[],
  allAssignments: WorkAssignment[],
  clocks: ExistingClock[],
  shiftStatuses: ShiftClockStatusDetail[],
  now: Date = parseTaipeiNow()
): ClockReminder[] {
  const reminders: ClockReminder[] = [];
  const work = filterWorkAssignments(todayAssignments);

  for (const shift of shiftStatuses) {
    const assignment = work.find((a) => a.id === shift.assignmentId);
    if (!assignment) continue;

    const expectedIn = toTaipeiDateTime(today, assignment.expected_clock_in);
    const expectedOut = toTaipeiDateTime(today, assignment.expected_clock_out);
    const inDeadline = hoursAfter(expectedIn, FORGETFUL_BUFFER_HOURS);
    const outDeadline = hoursAfter(expectedOut, FORGETFUL_BUFFER_HOURS);

    const hasIn = !!shift.clockInAt;
    const hasOut = !!shift.clockOutAt;

    if (!hasIn && today === formatTaipeiDate(now) && now >= inDeadline) {
      reminders.push({
        type: "missed_clock_in",
        severity: "error",
        message:
          "您已超過表定上班時間達 2.5 小時，系統未偵測到您的出勤紀錄，請記得點選上班打卡或聯繫管理員補登。",
        assignmentId: assignment.id,
        shiftName: assignment.shift_name,
        workDate: today,
      });
    }

    if (hasIn && !hasOut && now >= outDeadline) {
      reminders.push({
        type: "missed_clock_out",
        severity: "warning",
        message:
          "系統偵測到已超過您的表定下班時間 2.5 小時，您上次是否忘記點擊「下班打卡」？請聯繫管理員補登，或點此進行下班修正。",
        assignmentId: assignment.id,
        shiftName: assignment.shift_name,
        workDate: today,
      });
    }
  }

  const staleOpen = findStaleOpenClockOut(
    filterWorkAssignments(allAssignments),
    clocks,
    today,
    now
  );
  for (const stale of staleOpen) {
    if (reminders.some((r) => r.type === "stale_clock_out" && r.workDate === stale.workDate)) {
      continue;
    }
    reminders.unshift({
      type: "stale_clock_out",
      severity: "warning",
      message: `系統偵測到 ${stale.workDate} ${stale.shiftName} 已上班但未下班，是否忘記打卡？請聯繫管理員補登。`,
      assignmentId: stale.assignmentId,
      shiftName: stale.shiftName,
      workDate: stale.workDate,
    });
  }

  return reminders;
}

function findStaleOpenClockOut(
  work: WorkAssignment[],
  clocks: ExistingClock[],
  today: string,
  now: Date
): { workDate: string; assignmentId: string; shiftName: string }[] {
  const stale: { workDate: string; assignmentId: string; shiftName: string }[] = [];

  for (const c of clocks) {
    if (c.clock_type !== "clock_in" || !c.assignment_id) continue;
    const clockDate = c.clocked_at.slice(0, 10);
    if (clockDate >= today) continue;

    const hasOut = clocks.some(
      (o) =>
        o.assignment_id === c.assignment_id &&
        o.clock_type === "clock_out" &&
        o.clocked_at > c.clocked_at
    );
    if (hasOut) continue;

    const assignment = work.find((a) => a.id === c.assignment_id);
    if (!assignment) continue;

    const expectedOut = toTaipeiDateTime(clockDate, assignment.expected_clock_out);
    if (now >= hoursAfter(expectedOut, FORGETFUL_BUFFER_HOURS)) {
      stale.push({
        workDate: clockDate,
        assignmentId: assignment.id,
        shiftName: assignment.shift_name,
      });
    }
  }

  return stale;
}

function formatTaipeiDate(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}
