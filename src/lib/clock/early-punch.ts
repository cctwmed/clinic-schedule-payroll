/** 合理提早打卡緩衝（分鐘）：此時間內提早仍自動對齊班表，不標異常 */
export const EARLY_PUNCH_BUFFER_MINUTES = 30;

export interface EarlyPunchEvaluation {
  isEarly: boolean;
  earlyMinutes: number;
  /** 提早超過緩衝，待院長審核 */
  isEarlyAbnormal: boolean;
  /** 薪資工時預設起算時間（對齊班表開始） */
  payableClockedAt: string;
  earlyWorkApproved: boolean;
}

/**
 * 評估上班打卡是否提早，並決定薪資起算時間。
 * 遲到不在此處理（維持既有 is_late 邏輯）。
 */
export function evaluateEarlyPunch(
  clockType: "clock_in" | "clock_out" | "break_start" | "break_end",
  clockedAt: Date,
  expectedAt: Date | null
): EarlyPunchEvaluation {
  const actualIso = clockedAt.toISOString();
  const base: EarlyPunchEvaluation = {
    isEarly: false,
    earlyMinutes: 0,
    isEarlyAbnormal: false,
    payableClockedAt: actualIso,
    earlyWorkApproved: false,
  };

  if (clockType !== "clock_in" || !expectedAt) {
    return base;
  }

  if (clockedAt.getTime() >= expectedAt.getTime()) {
    return base;
  }

  const earlyMinutes = Math.max(
    0,
    Math.floor((expectedAt.getTime() - clockedAt.getTime()) / 60_000)
  );

  return {
    isEarly: true,
    earlyMinutes,
    isEarlyAbnormal: earlyMinutes > EARLY_PUNCH_BUFFER_MINUTES,
    payableClockedAt: expectedAt.toISOString(),
    earlyWorkApproved: false,
  };
}

/** 薪資／工時計算用的上班起算時間 */
export function resolvePayableClockIn(
  actualClockedAt: string,
  payableClockedAt: string | null | undefined,
  earlyWorkApproved: boolean | null | undefined
): string {
  if (earlyWorkApproved) return actualClockedAt;
  return payableClockedAt ?? actualClockedAt;
}

export function formatEarlyPunchNote(evalResult: EarlyPunchEvaluation): string | null {
  if (!evalResult.isEarly) return null;
  if (evalResult.isEarlyAbnormal) {
    return `提早 ${evalResult.earlyMinutes} 分鐘（超過 ${EARLY_PUNCH_BUFFER_MINUTES} 分鐘緩衝，待院長審核）`;
  }
  return `提早 ${evalResult.earlyMinutes} 分鐘，薪資工時對齊班表起算`;
}

export function formatEarlyPunchUserMessage(
  evalResult: EarlyPunchEvaluation,
  expectedAt: Date | null
): string | null {
  if (!evalResult.isEarly || !expectedAt) return null;
  const scheduled = expectedAt.toLocaleTimeString("zh-TW", {
    timeZone: "Asia/Taipei",
    hour: "2-digit",
    minute: "2-digit",
  });
  if (evalResult.isEarlyAbnormal) {
    return `已記錄實際打卡時間。提早 ${evalResult.earlyMinutes} 分鐘（超過 ${EARLY_PUNCH_BUFFER_MINUTES} 分鐘），薪資暫自 ${scheduled} 起算，待院長審核是否核可提早工時。`;
  }
  return `已記錄實際打卡時間。提早 ${evalResult.earlyMinutes} 分鐘內，薪資工時自班表 ${scheduled} 起算。`;
}
