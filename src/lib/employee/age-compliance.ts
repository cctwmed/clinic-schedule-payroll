/** 台灣身分證字號解析生日、年齡與童工合規 */

export type AgeComplianceStatus = "under_15" | "child_laborer" | "normal";

export interface AgeComplianceResult {
  age: number | null;
  status: AgeComplianceStatus;
  birthDate: string | null;
  isChildLaborer: boolean;
}

const UNDER_15_WARNING =
  "⚠️ 提醒：同仁未滿 15 歲，依法非經主管機關許可不得僱用，且無法直接申報勞保。";

export function getUnder15WarningMessage(): string {
  return UNDER_15_WARNING;
}

/** 解析舊式 10 碼身分證（含民國出生日期） */
export function parseTaiwanIdBirthDate(nationalId: string): string | null {
  const id = nationalId.trim().toUpperCase();
  if (!/^[A-Z][1289][0-9]{8}$/.test(id)) return null;

  const gender = id[1];
  const yymmdd = id.slice(2, 8);
  const yy = parseInt(yymmdd.slice(0, 2), 10);
  const mm = yymmdd.slice(2, 4);
  const dd = yymmdd.slice(4, 6);

  if (parseInt(mm, 10) < 1 || parseInt(mm, 10) > 12) return null;
  if (parseInt(dd, 10) < 1 || parseInt(dd, 10) > 31) return null;

  let year: number;
  if (gender === "1" || gender === "2") year = yy + 1911;
  else if (gender === "8" || gender === "9") year = yy + 2011;
  else return null;

  const iso = `${year}-${mm}-${dd}`;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return iso;
}

export function calculateAge(birthDate: string, referenceDate: Date = new Date()): number {
  const birth = new Date(birthDate);
  let age = referenceDate.getFullYear() - birth.getFullYear();
  const monthDiff = referenceDate.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && referenceDate.getDate() < birth.getDate())) {
    age -= 1;
  }
  return age;
}

export function resolveAgeCompliance(
  birthDate: string | null | undefined,
  nationalId?: string | null
): AgeComplianceResult {
  let resolvedBirth = birthDate?.trim() || null;

  if (!resolvedBirth && nationalId?.trim()) {
    resolvedBirth = parseTaiwanIdBirthDate(nationalId);
  }

  if (!resolvedBirth) {
    return { age: null, status: "normal", birthDate: null, isChildLaborer: false };
  }

  const age = calculateAge(resolvedBirth);

  if (age < 15) {
    return { age, status: "under_15", birthDate: resolvedBirth, isChildLaborer: false };
  }
  if (age >= 15 && age < 16) {
    return { age, status: "child_laborer", birthDate: resolvedBirth, isChildLaborer: true };
  }

  return { age, status: "normal", birthDate: resolvedBirth, isChildLaborer: false };
}

export function formatAgeDisplay(compliance: AgeComplianceResult): string | null {
  if (compliance.age == null) return null;
  return `${compliance.age} 歲`;
}

/** 童工禁止時段：20:00–翌日 06:00 */
export function shiftViolatesChildLaborNightHours(
  clockIn: string,
  clockOut: string
): boolean {
  const inMin = parseTimeToMinutes(clockIn);
  let outMin = parseTimeToMinutes(clockOut);

  if (inMin == null || outMin == null) return false;
  if (outMin <= inMin) outMin += 24 * 60;

  const forbidden: [number, number][] = [
    [20 * 60, 24 * 60],
    [24 * 60, 30 * 60],
  ];

  for (const [start, end] of forbidden) {
    if (intervalsOverlap(inMin, outMin, start, end)) return true;
  }
  return false;
}

export const CHILD_LABOR_NIGHT_SHIFT_ERROR =
  "此員工為童工（15–16 歲），依法禁止排入 20:00 至翌日 06:00 的診班。";

function parseTimeToMinutes(time: string): number | null {
  const m = time.trim().match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

function intervalsOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}
