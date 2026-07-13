const OFF_DAY_CODES = new Set(["STATUTORY", "REST", "ANNUAL_LEAVE"]);
const WORK_SHIFT_CODES = new Set(["MORNING", "EVENING", "AFTERNOON"]);

export function isOffDayShiftCode(code: string): boolean {
  return OFF_DAY_CODES.has(code);
}

export function isWorkShiftCode(code: string): boolean {
  return WORK_SHIFT_CODES.has(code);
}

export interface ShiftCodeInfo {
  code: string;
  category: string;
}

export function validateSameDayAssignment(
  target: ShiftCodeInfo,
  existingCodes: string[]
): { ok: true } | { ok: false; error: string } {
  const targetIsWork =
    isWorkShiftCode(target.code) ||
    ["morning", "afternoon", "evening"].includes(target.category);
  const targetIsOff = isOffDayShiftCode(target.code);

  for (const code of existingCodes) {
    if (targetIsWork && isOffDayShiftCode(code)) {
      return {
        ok: false,
        error: `此日已排例假/休息日，無法再加診別。請先清除例假或休息日欄位。`,
      };
    }
    if (targetIsOff && isWorkShiftCode(code)) {
      return {
        ok: false,
        error: `此日已排早診/晚診，無法再加例假或休息日。請先清除診別欄位。`,
      };
    }
  }

  return { ok: true };
}
