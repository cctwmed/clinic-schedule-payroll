import type { RotationTrack } from "@/lib/shift-templates";

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

export interface ScheduleMeta {
  golden?: GoldenScheduleConfig;
  closures?: ClosureRecord[];
  /** 班表額外標記的國定假日／颱風假等（合併行政院假日表） */
  nationalHolidays?: string[];
}

export function normalizeScheduleMode(
  mode: ScheduleRotationMode | undefined | null
): ScheduleRotationMode {
  return mode === "triple" ? "triple" : "dual";
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
    };
  }
  return null;
}

export function serializeScheduleMeta(meta: ScheduleMeta): string {
  return JSON.stringify(meta);
}

export function serializeGoldenConfig(config: GoldenScheduleConfig): string {
  return serializeScheduleMeta({
    golden: {
      ...config,
      mode: normalizeScheduleMode(config.mode),
      oddWeekTrackForA: config.oddWeekTrackForA ?? 1,
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
