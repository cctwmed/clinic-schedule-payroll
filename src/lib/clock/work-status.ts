import { suggestNextClockAction, type ExistingClock, type WorkAssignment } from "@/lib/clock/session";

/** 同仁當日出勤狀態（按鈕狀態機） */
export type WorkDutyStatus = "off_duty" | "on_duty" | "all_done";

export function resolveWorkDutyStatus(
  assignments: WorkAssignment[],
  clocks: ExistingClock[]
): WorkDutyStatus {
  const next = suggestNextClockAction(assignments, clocks);
  if (next === "clock_in") return "off_duty";
  if (next === "clock_out") return "on_duty";
  return "all_done";
}

export function workDutyStatusLabel(status: WorkDutyStatus): string {
  if (status === "on_duty") return "上班中";
  if (status === "all_done") return "今日已完成";
  return "未上班";
}
