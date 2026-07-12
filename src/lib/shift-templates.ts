/**
 * 診所第一階段：雙人全正職輪替「黃金班表」常數
 * 開診 08:30，員工 08:20 到
 */
export const LEGAL_COMPLIANCE_WARNING =
  "⚠️ 法律合規提醒：本系統依「四週變形工時」與診所雙人輪替班表計算。請確保已依法召開勞資會議並留存同意紀錄，否則勞檢時可能面臨行政處份。";

export const GOLDEN_SCHEDULE = {
  /** 每週 11 診 */
  SESSIONS_PER_WEEK: 11,
  MORNING_IN: "08:20",
  MORNING_OUT: "12:00",
  EVENING_IN: "16:00",
  EVENING_OUT: "20:00",
  /** 單診日工時（08:20–12:00） */
  HALF_DAY_HOURS: 3.67,
  /** 雙診日工時（早+晚） */
  DUAL_DAY_HOURS: 7.67,
  /** 軌道一週正常工時（週三半天 + 六日大休） */
  WEEKLY_HOURS_TRACK1: 34.3,
  /** 軌道二週正常工時（週三例休 + 六日早半班） */
  WEEKLY_HOURS_TRACK2: 38,
  /** 輪班間隔安全線（晚診 20:00 → 次日 08:20 = 12h20m） */
  REST_BETWEEN_SHIFTS_HOURS: 11,
  REST_BETWEEN_ACTUAL_HOURS: 12.33,
  BREAK_REMINDER_HOURS: 4,
  BREAK_DURATION_MINUTES: 30,
  /** 彈性假日／績效獎金手動區間 */
  FLEXIBLE_BONUS_MIN: 500,
  FLEXIBLE_BONUS_MAX: 2000,
  /** 合規容許誤差（小時） */
  HOURS_TOLERANCE: 0.5,
} as const;

export type RotationTrack = 1 | 2;

export interface ShiftSlotDef {
  code: string;
  name: string;
  category: "morning" | "afternoon" | "evening" | "custom" | "closed";
  default_clock_in: string | null;
  default_clock_out: string | null;
  planned_hours: number;
  color_hex: string;
  sort_order: number;
}

/** 診所黃金班表班別定義 */
export function buildGoldenShiftSlots(): ShiftSlotDef[] {
  return [
    {
      code: "MORNING",
      name: "早診",
      category: "morning",
      default_clock_in: GOLDEN_SCHEDULE.MORNING_IN,
      default_clock_out: GOLDEN_SCHEDULE.MORNING_OUT,
      planned_hours: GOLDEN_SCHEDULE.HALF_DAY_HOURS,
      color_hex: "#F59E0B",
      sort_order: 1,
    },
    {
      code: "EVENING",
      name: "晚診",
      category: "evening",
      default_clock_in: GOLDEN_SCHEDULE.EVENING_IN,
      default_clock_out: GOLDEN_SCHEDULE.EVENING_OUT,
      planned_hours: GOLDEN_SCHEDULE.DUAL_DAY_HOURS - GOLDEN_SCHEDULE.HALF_DAY_HOURS,
      color_hex: "#8B5CF6",
      sort_order: 2,
    },
    {
      code: "STATUTORY",
      name: "例假",
      category: "custom",
      default_clock_in: null,
      default_clock_out: null,
      planned_hours: 0,
      color_hex: "#EF4444",
      sort_order: 10,
    },
    {
      code: "REST",
      name: "休息日",
      category: "custom",
      default_clock_in: null,
      default_clock_out: null,
      planned_hours: 0,
      color_hex: "#64748B",
      sort_order: 11,
    },
    {
      code: "ANNUAL_LEAVE",
      name: "特休",
      category: "custom",
      default_clock_in: null,
      default_clock_out: null,
      planned_hours: 0,
      color_hex: "#10B981",
      sort_order: 12,
    },
  ];
}

/** @deprecated 保留相容，請改用 buildGoldenShiftSlots */
export type ShiftTemplateId = "GOLDEN";
export type MorningStartOption = "08:20";

export function buildGoldenTemplate() {
  return {
    id: "GOLDEN" as const,
    label: "雙人全正職輪替（黃金班表）",
    description: "週一～二、四～五雙人早晚診；週三、六、日半日診＋雙週火車頭輪替",
    dailyRegularHours: GOLDEN_SCHEDULE.DUAL_DAY_HOURS,
    slots: buildGoldenShiftSlots(),
  };
}

export function getShiftTemplate() {
  return buildGoldenTemplate();
}

export const TEMPLATE_OPTIONS = [
  { id: "GOLDEN" as const, label: "雙人全正職輪替（黃金班表）" },
];

export const MORNING_START_OPTIONS: MorningStartOption[] = ["08:20"];

/** 四週變形工時（保留週期上限，日／週以黃金班表為準） */
export const FLEXIBLE_LABOR = {
  CYCLE_DAYS: 28,
  MAX_REGULAR_HOURS_PER_CYCLE: 160,
  MAX_REGULAR_HOURS_PER_DAY: GOLDEN_SCHEDULE.DUAL_DAY_HOURS,
  MAX_HALF_DAY_HOURS: GOLDEN_SCHEDULE.HALF_DAY_HOURS,
  MAX_TOTAL_HOURS_PER_DAY: 12,
  WEEKLY_HOURS_TRACK1: GOLDEN_SCHEDULE.WEEKLY_HOURS_TRACK1,
  WEEKLY_HOURS_TRACK2: GOLDEN_SCHEDULE.WEEKLY_HOURS_TRACK2,
  MIN_STATUTORY_DAYS_PER_CYCLE: 4,
  MIN_REST_DAYS_PER_CYCLE: 4,
  MIN_REST_BETWEEN_SHIFTS_HOURS: GOLDEN_SCHEDULE.REST_BETWEEN_SHIFTS_HOURS,
  BREAK_REMINDER_HOURS: GOLDEN_SCHEDULE.BREAK_REMINDER_HOURS,
  HOURS_TOLERANCE: GOLDEN_SCHEDULE.HOURS_TOLERANCE,
} as const;

/** 是否為雙診日（週一、二、四、五） */
export function isDualClinicDay(dayOfWeek: number): boolean {
  return dayOfWeek === 1 || dayOfWeek === 2 || dayOfWeek === 4 || dayOfWeek === 5;
}

/** 是否為半日診日（週三、六、日） */
export function isHalfClinicDay(dayOfWeek: number): boolean {
  return dayOfWeek === 3 || dayOfWeek === 6 || dayOfWeek === 0;
}

export function getDayOfWeekTaipei(dateStr: string): number {
  return new Date(`${dateStr}T12:00:00+08:00`).getDay();
}

export function getISOWeek(dateStr: string): number {
  const d = new Date(`${dateStr}T12:00:00+08:00`);
  const target = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  target.setUTCDate(target.getUTCDate() + 4 - (target.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  return Math.ceil(((target.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

/** 取得員工 A 在該日所走軌道（1 或 2） */
export function getTrackForEmployeeA(
  dateStr: string,
  oddWeekTrackForA: RotationTrack = 1
): RotationTrack {
  const isOddWeek = getISOWeek(dateStr) % 2 === 1;
  if (oddWeekTrackForA === 1) {
    return isOddWeek ? 1 : 2;
  }
  return isOddWeek ? 2 : 1;
}

export function getTrackForEmployeeB(
  dateStr: string,
  oddWeekTrackForA: RotationTrack = 1
): RotationTrack {
  const aTrack = getTrackForEmployeeA(dateStr, oddWeekTrackForA);
  return aTrack === 1 ? 2 : 1;
}

export function getExpectedDailyHours(dateStr: string, shiftCodes: string[]): number {
  const dow = getDayOfWeekTaipei(dateStr);
  const hasEvening = shiftCodes.includes("EVENING");
  const hasMorning = shiftCodes.includes("MORNING");
  if (isDualClinicDay(dow) && hasMorning && hasEvening) {
    return GOLDEN_SCHEDULE.DUAL_DAY_HOURS;
  }
  if (hasMorning && !hasEvening) {
    return GOLDEN_SCHEDULE.HALF_DAY_HOURS;
  }
  return 0;
}

export function getExpectedWeeklyHours(track: RotationTrack): number {
  return track === 1
    ? GOLDEN_SCHEDULE.WEEKLY_HOURS_TRACK1
    : GOLDEN_SCHEDULE.WEEKLY_HOURS_TRACK2;
}
