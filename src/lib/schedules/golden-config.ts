import type { RotationTrack } from "@/lib/shift-templates";

export interface GoldenScheduleConfig {
  employeeAId: string;
  employeeBId: string;
  oddWeekTrackForA?: RotationTrack;
}

export function parseGoldenConfig(note: string | null): GoldenScheduleConfig | null {
  if (!note) return null;
  try {
    const parsed = JSON.parse(note) as { golden?: GoldenScheduleConfig };
    if (parsed.golden?.employeeAId && parsed.golden?.employeeBId) {
      return {
        employeeAId: parsed.golden.employeeAId,
        employeeBId: parsed.golden.employeeBId,
        oddWeekTrackForA: parsed.golden.oddWeekTrackForA ?? 1,
      };
    }
  } catch {
    /* 舊版純文字備註 */
  }
  return null;
}

export function serializeGoldenConfig(config: GoldenScheduleConfig): string {
  return JSON.stringify({ golden: { ...config, oddWeekTrackForA: config.oddWeekTrackForA ?? 1 } });
}
