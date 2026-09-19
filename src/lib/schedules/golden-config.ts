import type { RotationTrack } from "@/lib/shift-templates";
import { cellStaffIds } from "@/types/schedule";

/** 診所開診結構：目前暫定兩段班，之後可改三段班 */
export type ClinicSessionPattern = "two" | "three";

export const SESSION_PATTERN_OPTIONS: {
  id: ClinicSessionPattern;
  label: string;
  shortLabel: string;
  hint: string;
}[] = [
  {
    id: "two",
    label: "兩段班（早診＋晚診）",
    shortLabel: "兩段班",
    hint: "目前預設。打卡為早診、晚診各一組上下班。",
  },
  {
    id: "three",
    label: "三段班（早診＋午診＋晚診）",
    shortLabel: "三段班",
    hint: "切換後會出現午診欄，時間可改；打卡改為三組上下班。",
  },
];

export const MAX_NURSES_PER_SESSION = 6;
/** 格子預設可排到 6 人，現況只排 1 人也看得到「＋加入」 */
export const DEFAULT_STAFFING_PER_SESSION = 6;

export interface SessionClockRange {
  clockIn: string;
  clockOut: string;
}

export interface SessionTimesConfig {
  MORNING?: SessionClockRange;
  AFTERNOON?: SessionClockRange;
  EVENING?: SessionClockRange;
}

/** 快速排班模式：雙人長週末 vs 三人三週輪替 */
export type ScheduleRotationMode = "dual" | "triple";

export const SCHEDULE_MODE_OPTIONS: {
  id: ScheduleRotationMode;
  label: string;
  shortLabel: string;
}[] = [
  {
    id: "dual",
    label: "模式 A：雙人制（週三僅早診）",
    shortLabel: "雙人制",
  },
  {
    id: "triple",
    label: "模式 B：三人制（週三開早午診）",
    shortLabel: "三人制",
  },
];

export interface GoldenScheduleConfig {
  /** 缺省 dual（相容舊資料） */
  mode?: ScheduleRotationMode;
  employeeAId: string;
  employeeBId: string;
  /** 模式 B 第三人 */
  employeeCId?: string;
  oddWeekTrackForA?: RotationTrack;
  /** 缺省 two：兩段班 */
  sessionPattern?: ClinicSessionPattern;
  /** 每診人數上限 1～6，缺省 6（可先只排 1 人） */
  staffingPerSession?: number;
  sessionTimes?: SessionTimesConfig;
}

/**
 * 休診原因（影響薪資／合規）：
 * - voluntary：診所修假／業務休診 → 不視為國定／颱風出勤加發日
 * - national：國定假日休診 → 若當日仍出勤，依國定假加倍／延長加班
 * - typhoon：颱風／天然災害停診 → 同上（出勤適用加發）
 */
export type ClosureReason = "voluntary" | "national" | "typhoon";

export const CLOSURE_REASON_LABELS: Record<ClosureReason, string> = {
  voluntary: "診所修假／業務休診",
  national: "國定假日休診",
  typhoon: "颱風／天然災害停診",
};

export const CLOSURE_REASON_PAY_HINTS: Record<ClosureReason, string> = {
  voluntary:
    "不發國定加倍工資；預告休診改休息日；已發布則工時折抵（不扣薪）。當日若仍出勤以一般加班計。",
  national:
    "休診當天若無人出勤不加發；若仍出勤，依國定假 ≤8h 加發 1,136 元，超過另計延長加班（免稅不入 50 格式）。",
  typhoon:
    "停診當天若無人出勤不加發；若仍出勤，比照國定假加發規則（≤8h 1,136 元＋延長加班）。",
};

export interface ClosureRecord {
  date: string;
  /** 公佈前預告休診 vs 公佈後臨時休診 */
  mode: "planned" | "temporary";
  /** 休診原因（舊資料缺省視為修假） */
  reason?: ClosureReason;
  /** 臨時休診：計入四週已達成工時 */
  creditHours?: number;
  /** 備註（如颱風名稱） */
  note?: string;
}

/** 發布當下的班表快照：key = `${workDate}:${shiftTypeId}`，value = employeeId */
export type PublishedAssignmentSnapshot = Record<string, string>;

export interface ScheduleMeta {
  golden?: GoldenScheduleConfig;
  /** 本月開診：兩段班或三段班（優先於 golden.sessionPattern） */
  sessionPattern?: ClinicSessionPattern;
  staffingPerSession?: number;
  sessionTimes?: SessionTimesConfig;
  closures?: ClosureRecord[];
  /** 班表額外標記的國定假日／颱風假等（合併行政院假日表） */
  nationalHolidays?: string[];
  /** 首次發布時凍結，之後修改與快照不同則標紅 */
  publishedSnapshot?: PublishedAssignmentSnapshot;
}

export function readSessionPattern(meta: ScheduleMeta): ClinicSessionPattern {
  return normalizeSessionPattern(meta.sessionPattern ?? meta.golden?.sessionPattern);
}

export function readStaffingPerSession(meta: ScheduleMeta): number {
  return clampStaffingPerSession(
    meta.staffingPerSession ?? meta.golden?.staffingPerSession
  );
}

export function snapshotCellKey(workDate: string, shiftTypeId: string): string {
  return `${workDate}:${shiftTypeId}`;
}

export function snapshotStaffValue(
  staff: string[] | string | null | undefined
): string {
  return cellStaffIds(staff).slice().sort().join(",");
}

export function flattenAssignmentSnapshot(
  assignmentMap: Record<
    string,
    Record<string, string | string[] | null | undefined>
  >
): PublishedAssignmentSnapshot {
  const snapshot: PublishedAssignmentSnapshot = {};
  for (const [workDate, shifts] of Object.entries(assignmentMap)) {
    for (const [shiftTypeId, staff] of Object.entries(shifts)) {
      const value = snapshotStaffValue(staff);
      if (value) snapshot[snapshotCellKey(workDate, shiftTypeId)] = value;
    }
  }
  return snapshot;
}

export function isPublishedAmendment(
  snapshot: PublishedAssignmentSnapshot | null | undefined,
  workDate: string,
  shiftTypeId: string,
  currentStaff: string | string[] | null | undefined
): boolean {
  if (!snapshot) return false;
  const published = snapshot[snapshotCellKey(workDate, shiftTypeId)] ?? "";
  return snapshotStaffValue(published) !== snapshotStaffValue(currentStaff);
}

export function normalizeScheduleMode(
  mode: ScheduleRotationMode | undefined | null
): ScheduleRotationMode {
  return mode === "triple" ? "triple" : "dual";
}

export function normalizeSessionPattern(
  pattern: ClinicSessionPattern | undefined | null
): ClinicSessionPattern {
  return pattern === "three" ? "three" : "two";
}

export function clampStaffingPerSession(
  value: number | undefined | null
): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return DEFAULT_STAFFING_PER_SESSION;
  return Math.min(MAX_NURSES_PER_SESSION, Math.max(1, Math.round(n)));
}

export function normalizeClosureReason(
  reason: ClosureReason | undefined | null
): ClosureReason {
  if (reason === "national" || reason === "typhoon" || reason === "voluntary") {
    return reason;
  }
  return "voluntary";
}

/** 僅「診所修假」才自國定／颱風出勤加發日排除 */
export function voluntaryClosureDates(closures: ClosureRecord[] = []): string[] {
  return closures
    .filter((c) => normalizeClosureReason(c.reason) === "voluntary")
    .map((c) => c.date);
}

/** 國定／颱風休診日：仍應列入出勤加發候選日 */
export function holidayLikeClosureDates(closures: ClosureRecord[] = []): string[] {
  return closures
    .filter((c) => {
      const r = normalizeClosureReason(c.reason);
      return r === "national" || r === "typhoon";
    })
    .map((c) => c.date);
}

export function parseScheduleMeta(note: string | null): ScheduleMeta {
  if (!note) return {};
  try {
    const parsed = JSON.parse(note) as ScheduleMeta;
    return parsed ?? {};
  } catch {
    return {};
  }
}

export function parseGoldenConfig(note: string | null): GoldenScheduleConfig | null {
  const meta = parseScheduleMeta(note);
  if (meta.golden?.employeeAId && meta.golden?.employeeBId) {
    const mode = normalizeScheduleMode(meta.golden.mode);
    return {
      mode,
      employeeAId: meta.golden.employeeAId,
      employeeBId: meta.golden.employeeBId,
      employeeCId: meta.golden.employeeCId,
      oddWeekTrackForA: meta.golden.oddWeekTrackForA ?? 1,
      sessionPattern: normalizeSessionPattern(meta.golden.sessionPattern),
      staffingPerSession: clampStaffingPerSession(meta.golden.staffingPerSession),
      sessionTimes: meta.golden.sessionTimes,
    };
  }
  return null;
}

export function serializeScheduleMeta(meta: ScheduleMeta): string {
  return JSON.stringify(meta);
}

export function serializeGoldenConfig(config: GoldenScheduleConfig): string {
  return serializeScheduleMeta({
    sessionPattern: normalizeSessionPattern(config.sessionPattern),
    staffingPerSession: clampStaffingPerSession(config.staffingPerSession),
    sessionTimes: config.sessionTimes,
    golden: {
      ...config,
      mode: normalizeScheduleMode(config.mode),
      oddWeekTrackForA: config.oddWeekTrackForA ?? 1,
      sessionPattern: normalizeSessionPattern(config.sessionPattern),
      staffingPerSession: clampStaffingPerSession(config.staffingPerSession),
    },
  });
}

export function mergeScheduleMeta(
  note: string | null,
  patch: Partial<ScheduleMeta>
): string {
  const current = parseScheduleMeta(note);
  return serializeScheduleMeta({ ...current, ...patch });
}

export function getClosureForDate(
  note: string | null,
  date: string
): ClosureRecord | undefined {
  return parseScheduleMeta(note).closures?.find((c) => c.date === date);
}
