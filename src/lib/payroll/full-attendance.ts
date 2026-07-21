/**
 * 全勤獎金：僅事假、普通病假依比例扣除；
 * 特休／婚假／喪假／產假／安胎假／生理假等法定假別不影響全勤。
 */
import { CLINIC_PAYROLL } from "@/lib/payroll/constants";

/** 全勤比例計算之月基準時數（34,000÷142≈239.4，採 240） */
export const FULL_ATTENDANCE_MONTH_HOURS = 240;

export function calculateFullAttendanceBonus(input: {
  personalLeaveHours: number;
  sickLeaveHours: number;
}): {
  fullAttendanceBonus: number;
  deductedAmount: number;
  deductibleHours: number;
  note: string;
} {
  const full = CLINIC_PAYROLL.FULL_ATTENDANCE_BONUS;
  const deductibleHours = Math.max(
    0,
    (Number(input.personalLeaveHours) || 0) + (Number(input.sickLeaveHours) || 0)
  );

  if (deductibleHours <= 0) {
    return {
      fullAttendanceBonus: full,
      deductedAmount: 0,
      deductibleHours: 0,
      note: "無欠勤事假／普通病假，全勤獎金全額發放",
    };
  }

  const ratio = Math.min(1, deductibleHours / FULL_ATTENDANCE_MONTH_HOURS);
  const deductedAmount = Math.round(full * ratio);
  const fullAttendanceBonus = Math.max(0, full - deductedAmount);

  return {
    fullAttendanceBonus,
    deductedAmount,
    deductibleHours,
    note: `事假／普通病假共 ${deductibleHours}h，依比例扣除全勤 ${deductedAmount} 元（法定假別不扣全勤）`,
  };
}
