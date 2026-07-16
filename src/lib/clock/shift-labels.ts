/** 可打卡的工作班別代碼（依 sort 排序；未來可加入 AFTERNOON 午診） */
export const WORK_SHIFT_CODES = ["MORNING", "AFTERNOON", "EVENING"] as const;
export type WorkShiftCode = (typeof WORK_SHIFT_CODES)[number];

const DISPLAY_NAMES: Record<string, string> = {
  MORNING: "早診",
  AFTERNOON: "午診",
  EVENING: "晚診",
};

/** 班別代碼 → 畫面顯示名稱（早診／午診／晚診） */
export function getShiftDisplayName(
  shiftCode: string | null | undefined,
  fallbackName?: string | null
): string {
  if (shiftCode && DISPLAY_NAMES[shiftCode]) return DISPLAY_NAMES[shiftCode];
  if (fallbackName?.trim()) return fallbackName.trim();
  return "班別";
}

/** 打卡按鈕標籤，例如「早診 · 上班打卡」 */
export function formatShiftClockActionLabel(
  shiftCode: string,
  shiftName: string,
  clockType: "clock_in" | "clock_out"
): string {
  const session = getShiftDisplayName(shiftCode, shiftName);
  const action = clockType === "clock_in" ? "上班打卡" : "下班打卡";
  return `${session} · ${action}`;
}

export function isWorkShiftCode(code: string): boolean {
  return WORK_SHIFT_CODES.includes(code as WorkShiftCode);
}
