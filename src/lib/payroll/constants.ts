/**
 * 診所 Phase 4 薪資架構常數（底薪、加班、特殊出勤）
 * 獎金類為非經常性薪資，不計入勞健保申報基數，併入所得稅 50 格式。
 */
export const CLINIC_PAYROLL = {
  /** 月薪底薪（含勞健保、6% 勞退申報基數） */
  MONTHLY_BASE_SALARY: 34_000,
  /** 平日加班／特種出勤時薪基數 */
  OT_HOURLY_RATE: 142,
  /** 國定假日／颱風天特殊出勤津貼（元／天） */
  SPECIAL_ATTENDANCE_DAILY: 1_133,
  /** 年終獎金預設：1 個月全薪 */
  YEAR_END_FULL_AMOUNT: 34_000,
  /** 年終比例分母（滿 12 個月） */
  YEAR_END_MONTHS_BASE: 12,
  /** 季度獎金發放月份（3、6、9、12 月底） */
  QUARTERLY_BONUS_MONTHS: [3, 6, 9, 12] as const,
  /** 季度績效獎金金額區間（元） */
  QUARTERLY_BONUS_MIN: 2_000,
  QUARTERLY_BONUS_MAX: 6_000,
  /** 特休未休畢折現日薪基數（月薪 / 30） */
  ANNUAL_LEAVE_DAILY_RATE: 34_000 / 30,
  OT_RATE_WEEKDAY_1: 1.34,
  OT_RATE_WEEKDAY_2: 1.67,
} as const;

export type QuarterlyBonusMonth = (typeof CLINIC_PAYROLL.QUARTERLY_BONUS_MONTHS)[number];

export function isQuarterlyBonusMonth(month: number): boolean {
  return (CLINIC_PAYROLL.QUARTERLY_BONUS_MONTHS as readonly number[]).includes(month);
}

export function getQuarterLabel(month: number): string | null {
  const map: Record<number, string> = {
    3: "Q1（1–3 月）",
    6: "Q2（4–6 月）",
    9: "Q3（7–9 月）",
    12: "Q4（10–12 月）",
  };
  return map[month] ?? null;
}

export function isYearEndBonusMonth(month: number): boolean {
  return month === 12;
}

/** 非經常性薪資合計（不計勞健保基數，併入 50 格式申報） */
export function sumNonRecurringBonus(item: {
  flexibleBonus: number;
  quarterlyBonus: number;
  yearEndBonus: number;
  annualLeavePayout?: number;
}): number {
  return (
    item.flexibleBonus +
    item.quarterlyBonus +
    item.yearEndBonus +
    (item.annualLeavePayout ?? 0)
  );
}
