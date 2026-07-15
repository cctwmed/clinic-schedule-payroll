import {
  summarizeHoursExcludingHolidayWorkDays,
  calculateHolidayAttendancePay,
  resolveHolidayDates,
  type HolidayDayPayDetail,
} from "@/lib/payroll/holiday-attendance-pay";
import { CLINIC_PAYROLL, sumNonRecurringBonus } from "@/lib/payroll/constants";
import { calculateMonthlyOvertimePay } from "@/lib/payroll/overtime-pay";
import { calculateYearEndBonus } from "@/lib/payroll/year-end-bonus";
import { GOLDEN_SCHEDULE } from "@/lib/shift-templates";
import type { ClockEvent, WorkShiftBlock } from "@/lib/compliance/types";
import type { LeavePayrollSummary } from "@/lib/payroll/leave-deductions";

export interface EmployeePayrollInput {
  id: string;
  name: string;
  employeeNo: string;
  hireDate: string;
  resignDate?: string | null;
  hourlyWage: number;
  laborInsuranceSelfPay: number;
  healthInsuranceSelfPay: number;
  laborInsuranceEmployerPay: number;
  healthInsuranceEmployerPay: number;
  laborPensionEmployerPay: number;
}

export interface PayrollBonusInput {
  flexibleBonus?: number;
  quarterlyBonus?: number;
  yearEndBonusManual?: number | null;
  yearEndBonusOverridden?: boolean;
  annualLeavePayout?: number;
  annualLeavePayoutDays?: number;
  annualLeaveRecordId?: string | null;
  manualOvertimeHours?: number;
  leavePayroll?: LeavePayrollSummary;
}

export interface PayrollLineItem {
  employeeId: string;
  employeeName: string;
  employeeNo: string;
  hireDate: string;
  regularHours: number;
  overtimeHours: number;
  /** 院長手動追加之臨時加班時數（因公延長） */
  manualOvertimeHours: number;
  overtimeHours2Tier: number;
  basePay: number;
  baseSalary: number;
  jobAllowance: number;
  fullAttendanceBonus: number;
  monthlyBaseSalary: number;
  overtimePay: number;
  flexibleBonus: number;
  quarterlyBonus: number;
  yearEndBonus: number;
  yearEndBonusCalculated: number;
  yearEndBonusOverridden: boolean;
  yearEndServiceMonths: number;
  annualLeavePayout: number;
  annualLeavePayoutDays: number;
  annualLeaveRecordId: string | null;
  /** 國定假日出勤天數 */
  specialAttendanceDays: number;
  /** 國定假日出勤加發合計 */
  specialAttendancePay: number;
  /** 國定假日加倍薪資（1136/天） */
  holidayDoublePay: number;
  /** 國定假日超過 8h 延長工時加班費 */
  holidayOvertimePay: number;
  personalLeaveHours: number;
  personalLeaveDeduction: number;
  sickLeaveHours: number;
  sickLeaveDeduction: number;
  leaveDeductionTotal: number;
  nonRecurringTotal: number;
  laborInsurance: number;
  healthInsurance: number;
  laborInsuranceEmployerPay: number;
  healthInsuranceEmployerPay: number;
  laborPensionEmployerPay: number;
  /** 員工自付扣款合計 */
  employeeDeductions: number;
  /** 診所負擔規費（雇主勞健保 + 勞退） */
  clinicBurdenTotal: number;
  /** 應繳國家規費（個人 + 雇主勞健保 + 勞退） */
  totalToStatePerEmployee: number;
  deductionTotal: number;
  recurringGross: number;
  grossPay: number;
  netPay: number;
  breakdown: Record<string, number | string | boolean | HolidayDayPayDetail[]>;
}

export interface PayrollCalcContext {
  year: number;
  month: number;
  includeQuarterlyBonus: boolean;
  includeYearEndBonus: boolean;
  /** 國定假日日期（班表標記 + 行政院假日 − 休診） */
  holidayDates?: Set<string>;
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

export function roundMoney(n: number): number {
  return round(n);
}

export function clampFlexibleBonus(amount: number): number {
  if (Number.isNaN(amount) || amount <= 0) return 0;
  return Math.min(
    GOLDEN_SCHEDULE.FLEXIBLE_BONUS_MAX,
    Math.max(GOLDEN_SCHEDULE.FLEXIBLE_BONUS_MIN, Math.round(amount))
  );
}

export function clampQuarterlyBonus(amount: number): number {
  if (Number.isNaN(amount) || amount <= 0) return 0;
  return Math.min(
    CLINIC_PAYROLL.QUARTERLY_BONUS_MAX,
    Math.max(CLINIC_PAYROLL.QUARTERLY_BONUS_MIN, Math.round(amount))
  );
}

export function recalcPayrollTotals(item: PayrollLineItem): PayrollLineItem {
  const totalOtHours = round(item.overtimeHours + (item.manualOvertimeHours ?? 0));
  const otTier1 = Math.min(totalOtHours, 2);
  const otTier2 = Math.max(0, totalOtHours - 2);
  const overtimePay = calculateMonthlyOvertimePay(otTier1 + otTier2);

  const nonRecurringTotal = sumNonRecurringBonus({
    flexibleBonus: item.flexibleBonus,
    quarterlyBonus: item.quarterlyBonus,
    yearEndBonus: item.yearEndBonus,
    annualLeavePayout: item.annualLeavePayout,
    specialAttendancePay: item.specialAttendancePay,
  });
  const recurringGross = item.basePay + overtimePay;
  const grossPay = recurringGross + nonRecurringTotal;
  const employeeDeductions = round(item.laborInsurance + item.healthInsurance);
  const leaveDeductionTotal = round(item.leaveDeductionTotal ?? 0);
  const netPay = grossPay - employeeDeductions - leaveDeductionTotal;
  const clinicBurdenTotal = round(
    item.laborInsuranceEmployerPay +
      item.healthInsuranceEmployerPay +
      item.laborPensionEmployerPay
  );
  const totalToStatePerEmployee = round(
    item.laborInsurance +
      item.laborInsuranceEmployerPay +
      item.healthInsurance +
      item.healthInsuranceEmployerPay +
      item.laborPensionEmployerPay
  );

  return {
    ...item,
    overtimePay,
    overtimeHours2Tier: round(otTier2),
    leaveDeductionTotal,
    nonRecurringTotal,
    employeeDeductions,
    deductionTotal: round(employeeDeductions + leaveDeductionTotal),
    clinicBurdenTotal,
    totalToStatePerEmployee,
    recurringGross: round(recurringGross),
    grossPay: round(grossPay),
    netPay: round(netPay),
    breakdown: {
      ...item.breakdown,
      flexibleBonus: item.flexibleBonus,
      quarterlyBonus: item.quarterlyBonus,
      yearEndBonus: item.yearEndBonus,
      manualOvertimeHours: item.manualOvertimeHours ?? 0,
      personalLeaveHours: item.personalLeaveHours ?? 0,
      personalLeaveDeduction: item.personalLeaveDeduction ?? 0,
      sickLeaveHours: item.sickLeaveHours ?? 0,
      sickLeaveDeduction: item.sickLeaveDeduction ?? 0,
      leaveDeductionTotal,
      holidayDoublePay: item.holidayDoublePay,
      holidayOvertimePay: item.holidayOvertimePay,
      nonRecurringTotal,
      recurringGross: round(recurringGross),
      employeeDeductions,
      laborInsuranceEmployerPay: item.laborInsuranceEmployerPay,
      healthInsuranceEmployerPay: item.healthInsuranceEmployerPay,
      laborPensionEmployerPay: item.laborPensionEmployerPay,
      clinicBurdenTotal,
      totalToStatePerEmployee,
      insuranceBase: CLINIC_PAYROLL.INSURANCE_REPORT_BASE,
      taxForm50NonRecurring: nonRecurringTotal,
    },
  };
}

export function calculateEmployeePayroll(
  employee: EmployeePayrollInput,
  periodStart: string,
  periodEnd: string,
  shifts: WorkShiftBlock[],
  clocks: ClockEvent[],
  bonusInput: PayrollBonusInput = {},
  context?: PayrollCalcContext
): PayrollLineItem {
  const holidayDates =
    context?.holidayDates ??
    resolveHolidayDates(periodStart, periodEnd, [], []);

  const holidayPay = calculateHolidayAttendancePay(
    employee.id,
    periodStart,
    periodEnd,
    shifts,
    clocks,
    { holidayDates }
  );

  const { regularHours, overtimeHours } = summarizeHoursExcludingHolidayWorkDays(
    employee.id,
    periodStart,
    periodEnd,
    shifts,
    clocks,
    holidayPay.excludeFromRegularOtDates
  );

  const otTier1 = Math.min(overtimeHours, 2);
  const otTier2 = Math.max(0, overtimeHours - 2);

  const baseSalary = CLINIC_PAYROLL.MONTHLY_BASE_SALARY;
  const jobAllowance = CLINIC_PAYROLL.JOB_ALLOWANCE;
  const fullAttendanceBonus = CLINIC_PAYROLL.FULL_ATTENDANCE_BONUS;
  const basePay = baseSalary + jobAllowance + fullAttendanceBonus;
  const overtimePay = calculateMonthlyOvertimePay(otTier1 + otTier2);

  const flexibleBonus = clampFlexibleBonus(bonusInput.flexibleBonus ?? 0);
  const quarterlyBonus = context?.includeQuarterlyBonus
    ? clampQuarterlyBonus(bonusInput.quarterlyBonus ?? 0)
    : 0;
  const annualLeavePayout = Math.max(0, Math.round(bonusInput.annualLeavePayout ?? 0));
  const annualLeavePayoutDays = Math.max(0, bonusInput.annualLeavePayoutDays ?? 0);
  const annualLeaveRecordId = bonusInput.annualLeaveRecordId ?? null;

  let yearEndBonus = 0;
  let yearEndBonusCalculated = 0;
  let yearEndBonusOverridden = false;
  let yearEndServiceMonths = 0;
  let yearEndFormula = "";

  if (context?.includeYearEndBonus && context.year) {
    const ye = calculateYearEndBonus({
      hireDate: employee.hireDate,
      payrollYear: context.year,
      resignDate: employee.resignDate,
      manualAmount: bonusInput.yearEndBonusManual,
      useManualOverride: bonusInput.yearEndBonusOverridden,
    });
    yearEndBonusCalculated = ye.calculatedAmount;
    yearEndBonus = ye.finalAmount;
    yearEndBonusOverridden = ye.isOverridden;
    yearEndServiceMonths = ye.serviceMonths;
    yearEndFormula = ye.formula;
  }

  const laborInsurance = round(employee.laborInsuranceSelfPay);
  const healthInsurance = round(employee.healthInsuranceSelfPay);
  const laborInsuranceEmployerPay = round(employee.laborInsuranceEmployerPay);
  const healthInsuranceEmployerPay = round(employee.healthInsuranceEmployerPay);
  const laborPensionEmployerPay = round(employee.laborPensionEmployerPay);

  const leavePay = bonusInput.leavePayroll ?? {
    personalLeaveHours: 0,
    personalLeaveDeduction: 0,
    sickLeaveHours: 0,
    sickLeaveDeduction: 0,
    leaveDeductionTotal: 0,
    fullPayLeaveHours: 0,
    leaveDetails: [],
  };

  const item: PayrollLineItem = {
    employeeId: employee.id,
    employeeName: employee.name,
    employeeNo: employee.employeeNo,
    hireDate: employee.hireDate,
    regularHours: round(regularHours),
    overtimeHours: round(otTier1 + otTier2),
    manualOvertimeHours: 0,
    overtimeHours2Tier: round(otTier2),
    basePay,
    baseSalary,
    jobAllowance,
    fullAttendanceBonus,
    monthlyBaseSalary: CLINIC_PAYROLL.TOTAL_FIXED_SALARY,
    overtimePay,
    flexibleBonus,
    quarterlyBonus,
    yearEndBonus,
    yearEndBonusCalculated,
    yearEndBonusOverridden,
    yearEndServiceMonths,
    annualLeavePayout,
    annualLeavePayoutDays,
    annualLeaveRecordId,
    specialAttendanceDays: holidayPay.days,
    specialAttendancePay: holidayPay.totalPay,
    holidayDoublePay: holidayPay.doublePayTotal,
    holidayOvertimePay: holidayPay.overtimePayTotal,
    personalLeaveHours: leavePay.personalLeaveHours,
    personalLeaveDeduction: leavePay.personalLeaveDeduction,
    sickLeaveHours: leavePay.sickLeaveHours,
    sickLeaveDeduction: leavePay.sickLeaveDeduction,
    leaveDeductionTotal: leavePay.leaveDeductionTotal,
    nonRecurringTotal: 0,
    laborInsurance,
    healthInsurance,
    laborInsuranceEmployerPay,
    healthInsuranceEmployerPay,
    laborPensionEmployerPay,
    employeeDeductions: 0,
    clinicBurdenTotal: 0,
    totalToStatePerEmployee: 0,
    deductionTotal: 0,
    recurringGross: 0,
    grossPay: 0,
    netPay: 0,
    breakdown: {
      hourlyWage: employee.hourlyWage,
      otHourlyRate: CLINIC_PAYROLL.OT_HOURLY_RATE,
      holidayDoubleDaily: CLINIC_PAYROLL.HOLIDAY_DOUBLE_PAY,
      holidayOtTier1Hourly: CLINIC_PAYROLL.HOLIDAY_OT_TIER1_HOURLY,
      holidayOtTier2Hourly: CLINIC_PAYROLL.HOLIDAY_OT_TIER2_HOURLY,
      specialAttendanceDays: holidayPay.days,
      specialAttendancePay: holidayPay.totalPay,
      holidayDoublePay: holidayPay.doublePayTotal,
      holidayOvertimePay: holidayPay.overtimePayTotal,
      holidayDayDetails: holidayPay.dayDetails,
      specialAttendanceDates: holidayPay.dates.join(", "),
      regularHours: round(regularHours),
      overtimeHours: round(otTier1 + otTier2),
      flexibleBonus,
      quarterlyBonus,
      yearEndBonus,
      yearEndBonusCalculated,
      yearEndBonusOverridden,
      yearEndServiceMonths,
      yearEndFormula,
      annualLeavePayout,
      annualLeavePayoutDays,
      salaryCategory: "國定假日出勤為非經常性薪資，不計勞健保基數",
      otRate1: CLINIC_PAYROLL.OT_RATE_WEEKDAY_1,
      otRate2: CLINIC_PAYROLL.OT_RATE_WEEKDAY_2,
      laborMode: "四週變形工時（黃金班表）",
      insuranceBase: CLINIC_PAYROLL.INSURANCE_REPORT_BASE,
      personalLeaveHours: leavePay.personalLeaveHours,
      personalLeaveDeduction: leavePay.personalLeaveDeduction,
      sickLeaveHours: leavePay.sickLeaveHours,
      sickLeaveDeduction: leavePay.sickLeaveDeduction,
      leaveDeductionTotal: leavePay.leaveDeductionTotal,
      fullPayLeaveHours: leavePay.fullPayLeaveHours,
    },
  };

  item.manualOvertimeHours = bonusInput.manualOvertimeHours ?? 0;
  return recalcPayrollTotals(item);
}

export function formatMoney(amount: number): string {
  return new Intl.NumberFormat("zh-TW", {
    style: "currency",
    currency: "TWD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

/** @deprecated 使用 clampFlexibleBonus */
export const clampBonus = clampFlexibleBonus;
