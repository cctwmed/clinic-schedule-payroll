import type { RotationTrack } from "@/lib/shift-templates";

export interface GoldenScheduleConfig {
  employeeAId: string;
  employeeBId: string;
  oddWeekTrackForA?: RotationTrack;
}

export interface ClosureRecord {
  date: string;
  /** 公佈前預告休診 vs 公佈後臨時休診 */
  mode: "planned" | "temporary";
  /** 臨時休診：計入四週已達成工時 */
  creditHours?: number;
}

export interface ScheduleMeta {
  golden?: GoldenScheduleConfig;
  closures?: ClosureRecord[];
  /** 班表額外標記的國定假日（含颱風假等，合併行政院假日表） */
  nationalHolidays?: string[];
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
    return {
      employeeAId: meta.golden.employeeAId,
      employeeBId: meta.golden.employeeBId,
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
    golden: { ...config, oddWeekTrackForA: config.oddWeekTrackForA ?? 1 },
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
