"use server";

import { revalidatePath } from "next/cache";
import { supabase } from "@/lib/supabase";
import { getDefaultClinic } from "@/lib/clinic";
import { checkCompliance, complianceIssueOverlapsRange } from "@/lib/compliance/check-compliance";
import {
  compliancePeriod,
  loadComplianceData,
  monthPeriod,
} from "@/lib/compliance/load-compliance-data";
import type { ComplianceIssue } from "@/lib/compliance/types";
import { parseGoldenConfig, parseScheduleMeta, holidayLikeClosureDates, voluntaryClosureDates } from "@/lib/schedules/golden-config";
import { resolveHolidayDates } from "@/lib/payroll/holiday-attendance-pay";
import {
  isFlexibleBonusMonth,
  isQuarterlyBonusMonth,
  isYearEndBonusMonth,
  getQuarterLabel,
} from "@/lib/payroll/constants";
import { fetchAnnualPayrollSummary, type AnnualPayrollSummary } from "@/lib/payroll/annual-summary";
import { buildInsuranceBracketWarnings, type InsuranceBracketWarning } from "@/lib/payroll/insurance-bracket-warnings";
import { countPendingEarlyAbnormal } from "@/lib/clock/early-punch-review";
import { findLeavePayoutsDue, markLeaveRecordSettled } from "@/lib/leave/service";
import { fetchApprovedLeavesForPeriod } from "@/lib/leave/leave-records-service";
import { summarizeLeavePayroll } from "@/lib/payroll/leave-deductions";
import {
  calculateEmployeePayroll,
  type PayrollLineItem,
} from "@/lib/payroll/calculator";

interface SavedBonusBreakdown {
  flexibleBonus?: number;
  quarterlyBonus?: number;
  yearEndBonus?: number;
  yearEndBonusManual?: number;
  yearEndBonusOverridden?: boolean;
  annualLeavePayout?: number;
  annualLeavePayoutDays?: number;
  annualLeaveRecordId?: string;
  manualOvertimeHours?: number;
}

export async function fetchPayrollPageData(year: number, month: number) {
  const clinic = await getDefaultClinic();
  const { start, end } = monthPeriod(year, month);
  const compPeriod = compliancePeriod(year, month);

  const { data: employees, error: empError } = await supabase
    .from("employees")
    .select(
      "id, name, employee_no, hire_date, resign_date, status, hourly_wage, labor_insurance_self_pay, health_insurance_self_pay, labor_insurance_employer_pay, health_insurance_employer_pay, labor_pension_employer_pay"
    )
    .eq("clinic_id", clinic.id)
    .in("status", ["active", "inactive"])
    .order("employee_no");

  if (empError) throw new Error(empError.message);

  const { data: schedule } = await supabase
    .from("schedules")
    .select("note")
    .eq("clinic_id", clinic.id)
    .eq("year", year)
    .eq("month", month)
    .maybeSingle();

  const goldenConfig = parseGoldenConfig(schedule?.note ?? null);
  const scheduleMeta = parseScheduleMeta(schedule?.note ?? null);
  const holidayDates = resolveHolidayDates(
    start,
    end,
    [
      ...(scheduleMeta.nationalHolidays ?? []),
      ...holidayLikeClosureDates(scheduleMeta.closures ?? []),
    ],
    voluntaryClosureDates(scheduleMeta.closures ?? [])
  );

  const complianceData = await loadComplianceData(clinic.id, compPeriod.start, compPeriod.end);
  const complianceIssues = checkCompliance({
    periodStart: compPeriod.start,
    periodEnd: compPeriod.end,
    shifts: complianceData.shifts,
    dayOffs: complianceData.dayOffs,
    clocks: complianceData.clocks,
    employeeIds: complianceData.employees.map((e) => ({ id: e.id, name: e.name })),
    employeeAId: goldenConfig?.employeeAId,
    oddWeekTrackForA: goldenConfig?.oddWeekTrackForA ?? 1,
  });

  const monthIssues = complianceIssues.filter((i) =>
    complianceIssueOverlapsRange(i, start, end)
  );

  const { data: existingRun } = await supabase
    .from("payroll_runs")
    .select("id, status, calculated_at")
    .eq("clinic_id", clinic.id)
    .eq("year", year)
    .eq("month", month)
    .maybeSingle();

  const savedBonuses = new Map<string, SavedBonusBreakdown>();
  if (existingRun?.id) {
    const { data: savedItems } = await supabase
      .from("payroll_items")
      .select("employee_id, breakdown")
      .eq("payroll_run_id", existingRun.id);

    for (const item of savedItems ?? []) {
      const breakdown = (item.breakdown ?? {}) as SavedBonusBreakdown;
      savedBonuses.set(item.employee_id, breakdown);
    }
  }

  const includeFlexible = isFlexibleBonusMonth(month);
  const includeQuarterly = isQuarterlyBonusMonth(month);
  const includeYearEnd = isYearEndBonusMonth(month);

  const leavePayouts = await findLeavePayoutsDue(clinic.id, year, month);
  const payoutByEmployee = new Map(leavePayouts.map((p) => [p.employeeId, p]));

  const approvedLeaves = await fetchApprovedLeavesForPeriod(clinic.id, start, end).catch(
    () => []
  );

  const lineItems: PayrollLineItem[] = (employees ?? []).map((emp) => {
    const saved = savedBonuses.get(emp.id);
    const due = payoutByEmployee.get(emp.id);
    const leavePayroll = summarizeLeavePayroll(
      approvedLeaves,
      emp.id,
      Number(emp.hourly_wage),
      emp.hire_date
    );
    return calculateEmployeePayroll(
      {
        id: emp.id,
        name: emp.name,
        employeeNo: emp.employee_no,
        hireDate: emp.hire_date,
        resignDate: emp.resign_date,
        status: (emp.status as "active" | "inactive" | "resigned") ?? "active",
        hourlyWage: Number(emp.hourly_wage),
        laborInsuranceSelfPay: Number(emp.labor_insurance_self_pay),
        healthInsuranceSelfPay: Number(emp.health_insurance_self_pay),
        laborInsuranceEmployerPay: Number(emp.labor_insurance_employer_pay ?? 0),
        healthInsuranceEmployerPay: Number(emp.health_insurance_employer_pay ?? 0),
        laborPensionEmployerPay: Number(emp.labor_pension_employer_pay ?? 0),
      },
      start,
      end,
      complianceData.shifts,
      complianceData.clocks,
      {
        flexibleBonus: saved?.flexibleBonus ?? 0,
        quarterlyBonus: saved?.quarterlyBonus ?? 0,
        yearEndBonusManual: saved?.yearEndBonusManual ?? saved?.yearEndBonus,
        yearEndBonusOverridden: saved?.yearEndBonusOverridden ?? false,
        annualLeavePayout: due?.payoutAmount ?? saved?.annualLeavePayout ?? 0,
        annualLeavePayoutDays: due?.unusedDays ?? saved?.annualLeavePayoutDays ?? 0,
        annualLeaveRecordId: due?.recordId ?? saved?.annualLeaveRecordId,
        manualOvertimeHours: saved?.manualOvertimeHours ?? 0,
        leavePayroll,
      },
      {
        year,
        month,
        includeFlexibleBonus: includeFlexible,
        includeQuarterlyBonus: includeQuarterly,
        includeYearEndBonus: includeYearEnd,
        holidayDates,
      },
      complianceData.dayOffs
    );
  });

  const { data: dbAlerts } = await supabase
    .from("compliance_alerts")
    .select("id, employee_id, alert_date, rule_code, message, severity, status")
    .eq("clinic_id", clinic.id)
    .gte("alert_date", start)
    .lte("alert_date", end)
    .order("alert_date", { ascending: false })
    .limit(20);

  let annualSummary: AnnualPayrollSummary | null = null;
  if (isYearEndBonusMonth(month)) {
    annualSummary = await fetchAnnualPayrollSummary(clinic.id, year);
  }

  const pendingEarlyPunchReview = await countPendingEarlyAbnormal(clinic.id).catch(
    () => 0
  );

  const insuranceBracketWarnings = await loadInsuranceBracketWarnings(
    clinic.id,
    year,
    month,
    (employees ?? []).map((e) => ({
      id: e.id,
      name: e.name,
      laborInsuranceSelfPay: Number(e.labor_insurance_self_pay),
      healthInsuranceSelfPay: Number(e.health_insurance_self_pay),
      laborInsuranceEmployerPay: Number(e.labor_insurance_employer_pay ?? 0),
    })),
    lineItems
  );

  return {
    clinic,
    year,
    month,
    periodStart: start,
    periodEnd: end,
    lineItems,
    complianceIssues: monthIssues,
    dbAlerts: dbAlerts ?? [],
    existingRun,
    isQuarterlyMonth: includeQuarterly,
    isYearEndMonth: includeYearEnd,
    quarterLabel: getQuarterLabel(month),
    annualSummary,
    leavePayoutsDue: leavePayouts,
    pendingEarlyPunchReview,
    insuranceBracketWarnings,
  };
}

async function loadInsuranceBracketWarnings(
  clinicId: string,
  year: number,
  month: number,
  employees: {
    id: string;
    name: string;
    laborInsuranceSelfPay: number;
    healthInsuranceSelfPay: number;
    laborInsuranceEmployerPay: number;
  }[],
  currentLineItems: PayrollLineItem[]
): Promise<InsuranceBracketWarning[]> {
  const grossByMonthEmployee = new Map<string, number>();

  for (const item of currentLineItems) {
    if (item.parentalLeaveSuspend) continue;
    grossByMonthEmployee.set(`${year}-${month}-${item.employeeId}`, item.grossPay);
  }

  // 前兩個月已結算應發
  const monthsNeeded: { year: number; month: number }[] = [];
  let y = year;
  let m = month;
  for (let i = 0; i < 2; i++) {
    if (m <= 1) {
      y -= 1;
      m = 12;
    } else {
      m -= 1;
    }
    monthsNeeded.push({ year: y, month: m });
  }

  for (const ym of monthsNeeded) {
    const { data: run } = await supabase
      .from("payroll_runs")
      .select("id")
      .eq("clinic_id", clinicId)
      .eq("year", ym.year)
      .eq("month", ym.month)
      .maybeSingle();
    if (!run?.id) continue;

    const { data: items } = await supabase
      .from("payroll_items")
      .select("employee_id, gross_pay")
      .eq("payroll_run_id", run.id);

    for (const row of items ?? []) {
      grossByMonthEmployee.set(
        `${ym.year}-${ym.month}-${row.employee_id}`,
        Number(row.gross_pay) || 0
      );
    }
  }

  return buildInsuranceBracketWarnings({
    year,
    month,
    employees,
    grossByMonthEmployee,
  });
}

export async function savePayrollRun(
  year: number,
  month: number,
  lineItems: PayrollLineItem[],
  complianceIssues: ComplianceIssue[]
) {
  const clinic = await getDefaultClinic();
  const { start, end } = monthPeriod(year, month);

  const { data: run, error: runError } = await supabase
    .from("payroll_runs")
    .upsert(
      {
        clinic_id: clinic.id,
        year,
        month,
        period_start: start,
        period_end: end,
        status: "calculated",
        calculated_at: new Date().toISOString(),
        note: buildRunNote(year, month, complianceIssues.length, lineItems),
      },
      { onConflict: "clinic_id,year,month" }
    )
    .select("id")
    .single();

  if (runError) return { success: false as const, error: runError.message };

  for (const item of lineItems) {
    await supabase.from("payroll_items").upsert(
      {
        payroll_run_id: run.id,
        employee_id: item.employeeId,
        regular_hours: item.regularHours,
        overtime_hours: item.overtimeHours,
        overtime_hours_2tier: item.overtimeHours2Tier,
        base_pay: item.basePay,
        overtime_pay: item.overtimePay,
        allowance_total: item.nonRecurringTotal,
        deduction_total: item.deductionTotal,
        gross_pay: item.grossPay,
        net_pay: item.netPay,
        breakdown: {
          ...item.breakdown,
          flexibleBonus: item.flexibleBonus,
          quarterlyBonus: item.quarterlyBonus,
          yearEndBonus: item.yearEndBonus,
          yearEndBonusCalculated: item.yearEndBonusCalculated,
          yearEndBonusOverridden: item.yearEndBonusOverridden,
          yearEndBonusManual: item.yearEndBonusOverridden ? item.yearEndBonus : undefined,
          yearEndServiceMonths: item.yearEndServiceMonths,
          annualLeavePayout: item.annualLeavePayout,
          annualLeavePayoutDays: item.annualLeavePayoutDays,
          annualLeaveRecordId: item.annualLeaveRecordId,
          nonRecurringTotal: item.nonRecurringTotal,
          recurringGross: item.recurringGross,
          monthlyBaseSalary: item.monthlyBaseSalary,
          laborInsurance: item.laborInsurance,
          healthInsurance: item.healthInsurance,
          laborInsuranceEmployerPay: item.laborInsuranceEmployerPay,
          healthInsuranceEmployerPay: item.healthInsuranceEmployerPay,
          laborPensionEmployerPay: item.laborPensionEmployerPay,
          employeeDeductions: item.employeeDeductions,
          clinicBurdenTotal: item.clinicBurdenTotal,
          totalToStatePerEmployee: item.totalToStatePerEmployee,
          manualOvertimeHours: item.manualOvertimeHours,
          restDayWorkDays: item.restDayWorkDays,
          restDayOvertimePay: item.restDayOvertimePay,
          restDayRequiredOffDays: item.restDayRequiredOffDays,
          restDayActualOffDays: item.restDayActualOffDays,
          taxForm50NonRecurring: item.nonRecurringTotal,
          insuranceBase: item.monthlyBaseSalary,
        },
      },
      { onConflict: "payroll_run_id,employee_id" }
    );

    if (item.annualLeaveRecordId && item.annualLeavePayout > 0) {
      await markLeaveRecordSettled(
        item.annualLeaveRecordId,
        item.annualLeavePayoutDays,
        item.annualLeavePayout,
        run.id
      );
    }
  }

  revalidatePath("/payroll");
  revalidatePath("/leave");
  return { success: true as const, runId: run.id };
}

function buildRunNote(
  year: number,
  month: number,
  issueCount: number,
  lineItems: PayrollLineItem[]
): string {
  const parts = [`${year}年${month}月結算`, `合規預警 ${issueCount} 項`];
  if (isFlexibleBonusMonth(month) || isQuarterlyBonusMonth(month)) {
    const flexTotal = lineItems.reduce((s, i) => s + i.flexibleBonus, 0);
    const qTotal = lineItems.reduce((s, i) => s + i.quarterlyBonus, 0);
    if (flexTotal > 0) parts.push(`彈性獎金 ${flexTotal} 元`);
    if (qTotal > 0) parts.push(`季度獎金 ${qTotal} 元`);
  }
  if (isYearEndBonusMonth(month)) {
    const total = lineItems.reduce((s, i) => s + i.yearEndBonus, 0);
    parts.push(`年終獎金 ${total} 元`);
  }
  const leaveTotal = lineItems.reduce((s, i) => s + i.annualLeavePayout, 0);
  if (leaveTotal > 0) {
    parts.push(`特休折現 ${leaveTotal} 元`);
  }
  return parts.join("；");
}
