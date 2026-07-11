export type ScheduleStatus = "draft" | "published" | "archived";
export type ShiftCategory = "morning" | "afternoon" | "evening" | "closed" | "custom";

export interface ShiftType {
  id: string;
  clinic_id: string;
  code: string;
  name: string;
  category: ShiftCategory;
  default_clock_in: string | null;
  default_clock_out: string | null;
  color_hex: string | null;
  sort_order: number;
}

export interface Schedule {
  id: string;
  clinic_id: string;
  year: number;
  month: number;
  status: ScheduleStatus;
  published_at: string | null;
  note: string | null;
}

export interface ShiftAssignment {
  id: string;
  schedule_id: string;
  employee_id: string;
  shift_type_id: string;
  work_date: string;
  expected_clock_in: string;
  expected_clock_out: string;
  status: string;
}

export interface ScheduleEmployee {
  id: string;
  name: string;
  employee_no: string;
  job_title?: string | null;
}

export interface DayAssignmentMap {
  [workDate: string]: {
    [shiftTypeId: string]: string | null;
  };
}

export const SCHEDULE_STATUS_LABELS: Record<ScheduleStatus, string> = {
  draft: "草稿",
  published: "已發布",
  archived: "已封存",
};

export function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

export function formatWorkDate(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function weekdayLabel(dateStr: string): string {
  const weekdays = ["日", "一", "二", "三", "四", "五", "六"];
  const day = new Date(`${dateStr}T00:00:00+08:00`).getDay();
  return weekdays[day];
}

export const ASSIGNABLE_CATEGORIES: ShiftCategory[] = ["morning", "afternoon", "evening"];

export const OFF_DAY_CATEGORIES: ShiftCategory[] = ["custom"];
