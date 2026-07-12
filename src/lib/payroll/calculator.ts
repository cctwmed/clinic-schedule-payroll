import { summarizeEmployeeHours } from "@/lib/compliance/check-compliance";
import type { ClockEvent, WorkShiftBlock } from "@/lib/compliance/types";
import { GOLDEN_SCHEDULE } from "@/lib/shift-templates";
import {
  CLINIC_PAYROLL,
  sumNonRecurringBonus,
} from "@/lib/payroll/constants";
import { calculateMonthlyOvertimePay } from "@/lib/payroll/overtime-pay";
import { calculateYearEndBonus } from "@/lib/payroll/year-end-bonus";

export interface EmployeePayrollInput {
  id: string;
  name: string;
  employeeNo: string;
  hireDate: string;
  resignDate?: string | null;
  hourlyWage: number;
  laborInsuranceSelfPay: number;
  healthInsuranceSelfPay: number;
}

export interface PayrollBonusInput {
  flexibleBonus?: number;
  quarterlyBonus?: number;
  yearEndBonusManual?: number | null;
  yearEndBonusOverridden?: boolean;
  annualLeavePayout?: number;
  annualLeavePayoutDays?: number;
  annualLeaveRecordId?: string | null;
}

export interface PayrollLineItem {
  employeeId: string;
  employeeName: string;
  employeeNo: string;
  hireDate: string;
  regularHours: number;
  overtimeHours: number;
  overtimeHours2Tier: number;
  /** 時數折算本薪（舊欄位，保留相容） */
  basePay: number;
  /** 底薪 */
  baseSalary: number;
  /** 職務加給 */
  jobAllowance: number;
  /** 全勤獎金 */
  fullAttendanceBonus: number;
  /** 診所固定月薪合計參考值 */
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
  nonRecurringTotal: number;
  laborInsurance: number;
  healthInsurance: number;
  deductionTotal: number;
  /** 經常性薪資（本薪+加班） */
  recurringGross: number;
  grossPay: number;
  netPay: number;
  breakdown: Record<string, number | string | boolean>;
}

export interface PayrollCalcContext {
  year: number;
  month: number;
  includeQuarterlyBonus: boolean;
  includeYearEndBonus: boolean;
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
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
  const nonRecurringTotal = sumNonRecurringBonus({
    flexibleBonus: item.flexibleBonus,
    quarterlyBonus: item.quarterlyBonus,
    yearEndBonus: item.yearEndBonus,
    annualLeavePayout: item.annualLeavePayout,
  });
  const recurringGross = item.basePay + item.overtimePay;
  const grossPay = recurringGross + nonRecurringTotal;
  const netPay = grossPay - item.deductionTotal;

  return {
    ...item,
    nonRecurringTotal,
    recurringGross: round(recurringGross),
    grossPay: round(grossPay),
    netPay: round(netPay),
    breakdown: {
      ...item.breakdown,
      flexibleBonus: item.flexibleBonus,
      quarterlyBonus: item.quarterlyBonus,
      yearEndBonus: item.yearEndBonus,
      yearEndBonusCalculated: item.yearEndBonusCalculated,
      yearEndBonusOverridden: item.yearEndBonusOverridden,
      yearEndServiceMonths: item.yearEndServiceMonths,
      annualLeavePayout: item.annualLeavePayout,
      annualLeavePayoutDays: item.annualLeavePayoutDays,
      nonRecurringTotal,
      recurringGross: round(recurringGross),
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
  const { regularHours, overtimeHours } = summarizeEmployeeHours(
    employee.id,
    periodStart,
    periodEnd,
    shifts,
    clocks
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
  const deductionTotal = laborInsurance + healthInsurance;

  const item: PayrollLineItem = {
    employeeId: employee.id,
    employeeName: employee.name,
    employeeNo: employee.employeeNo,
    hireDate: employee.hireDate,
    regularHours: round(regularHours),
    overtimeHours: round(otTier1 + otTier2),
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
    nonRecurringTotal: 0,
    laborInsurance,
    healthInsurance,
    deductionTotal,
    recurringGross: 0,
    grossPay: 0,
    netPay: 0,
    breakdown: {
      hourlyWage: employee.hourlyWage,
      otHourlyRate: CLINIC_PAYROLL.OT_HOURLY_RATE,
      baseSalary,
      jobAllowance,
      fullAttendanceBonus,
      monthlyBaseSalary: CLINIC_PAYROLL.TOTAL_FIXED_SALARY,
      insuranceReportBase: CLINIC_PAYROLL.INSURANCE_REPORT_BASE,
      specialAttendanceDaily: CLINIC_PAYROLL.SPECIAL_ATTENDANCE_DAILY,
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
      salaryCategory: "非經常性薪資不計勞健保基數",
      otRate1: CLINIC_PAYROLL.OT_RATE_WEEKDAY_1,
      otRate2: CLINIC_PAYROLL.OT_RATE_WEEKDAY_2,
      laborMode: "四週變形工時（黃金班表）",
      insuranceBase: CLINIC_PAYROLL.INSURANCE_REPORT_BASE,
    },
  };

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
