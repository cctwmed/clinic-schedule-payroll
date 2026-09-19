import { toTaipeiDateTime } from "@/lib/clock/session";

/** 上班／下班最早可打卡：班表時間前幾分鐘 */
export const CLOCK_EARLY_MINUTES = 25;

export interface ClockWindowEvaluation {
  allowed: boolean;
  earliestAt: Date | null;
  minutesUntilOpen: number;
}

export function earliestAllowedAt(expectedAt: Date): Date {
  return new Date(expectedAt.getTime() - CLOCK_EARLY_MINUTES * 60_000);
}

export function evaluateClockWindow(
  now: Date,
  expectedAt: Date | null
): ClockWindowEvaluation {
  if (!expectedAt) {
    return { allowed: true, earliestAt: null, minutesUntilOpen: 0 };
  }

  const earliestAt = earliestAllowedAt(expectedAt);
  const diff = earliestAt.getTime() - now.getTime();
  if (diff <= 0) {
    return { allowed: true, earliestAt, minutesUntilOpen: 0 };
  }

  return {
    allowed: false,
    earliestAt,
    minutesUntilOpen: Math.max(1, Math.ceil(diff / 60_000)),
  };
}

export function formatTaipeiClockHm(date: Date): string {
  return date.toLocaleTimeString("zh-TW", {
    timeZone: "Asia/Taipei",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function expectedAtOnWorkDate(workDate: string, time: string): Date {
  return toTaipeiDateTime(workDate, time);
}

export function formatClockWindowBlockMessage(
  clockType: "clock_in" | "clock_out",
  earliestAt: Date,
  minutesUntilOpen: number
): string {
  const time = formatTaipeiClockHm(earliestAt);
  if (clockType === "clock_in") {
    return `上班最早可於 ${time} 打卡（班表開始前 ${CLOCK_EARLY_MINUTES} 分鐘）。還差約 ${minutesUntilOpen} 分鐘。`;
  }
  return `下班最早可於 ${time} 打卡（班表結束前 ${CLOCK_EARLY_MINUTES} 分鐘）。還差約 ${minutesUntilOpen} 分鐘。`;
}
