import { supabase } from "@/lib/supabase";
import { monthPeriod, loadComplianceData } from "@/lib/compliance/load-compliance-data";
import { calculateEmployeePayroll } from "@/lib/payroll/calculator";
import { calculateOvertimePay } from "@/lib/payroll/overtime-pay";
import { CLINIC_PAYROLL } from "@/lib/payroll/constants";
import { parseScheduleMeta } from "@/lib/schedules/golden-config";
import { resolveHolidayDates } from "@/lib/payroll/holiday-attendance-pay";
import { fetchApprovedLeavesForPeriod } from "@/lib/leave/leave-records-service";
import { summarizeLeavePayroll } from "@/lib/payroll/leave-deductions";
import type { HolidayDayPayDetail } from "@/lib/payroll/holiday-attendance-pay";
import { getDaysInMonth, formatWorkDate } from "@/types/schedule";

const OFF_CODES = new Set(["STATUTORY", "REST", "ANNUAL_LEAVE", "CLOSED"]);

export interface MobileScheduleDay {
  date: string;
  dayOfMonth: number;
  shifts: { code: string; name: string; timeRange: string }[];
  isClosure: boolean;
  isNationalHoliday: boolean;
}

export async function fetchMobileSchedule(
  employeeId: string,
  clinicId: string,
  year: number,
  month: number
) {
  const daysInMonth = getDaysInMonth(year, month);
  const { start, end } = monthPeriod(year, month);

  const { data: schedule } = await supabase
    .from("schedules")
    .select("id, note, status")
    .eq("clinic_id", clinicId)
    .eq("year", year)
    .eq("month", month)
    .maybeSingle();

  const meta = parseScheduleMeta(schedule?.note ?? null);
  const closureDates = new Set((meta.closures ?? []).map((c) => c.date));
  const holidayDates = resolveHolidayDates(
    start,
    end,
    meta.nationalHolidays ?? [],
    [...closureDates]
  );

  const { data: assignments } = await supabase
    .from("shift_assignments")
    .select("work_date, expected_clock_in, expected_clock_out, shift_types(code, name)")
    .eq("employee_id", employeeId)
    .gte("work_date", start)
    .lte("work_date", end)
    .neq("status", "cancelled")
    .order("work_date");

  const byDate = new Map<string, MobileScheduleDay["shifts"]>();

  for (const a of assignments ?? []) {
    const st = parseShiftJoin(a.shift_types);
    const code = st?.code ?? "";
    const name = st?.name ?? "班別";
    const date = a.work_date;
    if (!byDate.has(date)) byDate.set(date, []);
    byDate.get(date)!.push({
      code,
      name,
      timeRange: `${String(a.expected_clock_in).slice(0, 5)}–${String(a.expected_clock_out).slice(0, 5)}`,
    });
  }

  const days: MobileScheduleDay[] = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const date = formatWorkDate(year, month, d);
    days.push({
      date,
      dayOfMonth: d,
      shifts: byDate.get(date) ?? [],
      isClosure: closureDates.has(date),
      isNationalHoliday: holidayDates.has(date),
    });
  }

  return {
    year,
    month,
    scheduleStatus: schedule?.status ?? "none",
    days,
    closureDates: [...closureDates],
    holidayDates: [...holidayDates],
    laborMode: "四週變形工時",
    cycleHoursTarget: 160,
  };
}

export async function fetchMobilePayslip(
  employeeId: string,
  clinicId: string,
  year: number,
  month: number
) {
  const { start, end } = monthPeriod(year, month);

  const { data: emp } = await supabase
    .from("employees")
    .select(
      "id, name, employee_no, hire_date, resign_date, hourly_wage, labor_insurance_self_pay, health_insurance_self_pay, labor_insurance_employer_pay, health_insurance_employer_pay, labor_pension_employer_pay"
    )
    .eq("id", employeeId)
    .single();

  if (!emp) throw new Error("找不到員工");

  const { data: schedule } = await supabase
    .from("schedules")
    .select("note")
    .eq("clinic_id", clinicId)
    .eq("year", year)
    .eq("month", month)
    .maybeSingle();

  const meta = parseScheduleMeta(schedule?.note ?? null);
  const closureDates = (meta.closures ?? []).map((c) => c.date);
  const holidayDates = resolveHolidayDates(
    start,
    end,
    meta.nationalHolidays ?? [],
    closureDates
  );

  const complianceData = await loadComplianceData(clinicId, start, end);
  const approvedLeaves = await fetchApprovedLeavesForPeriod(clinicId, start, end).catch(
    () => []
  );
  const leavePayroll = summarizeLeavePayroll(
    approvedLeaves,
    employeeId,
    Number(emp.hourly_wage)
  );

  const line = calculateEmployeePayroll(
    {
      id: emp.id,
      name: emp.name,
      employeeNo: emp.employee_no,
      hireDate: emp.hire_date,
      resignDate: emp.resign_date,
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
    { leavePayroll },
    {
      year,
      month,
      includeFlexibleBonus: false,
      includeQuarterlyBonus: false,
      includeYearEndBonus: false,
      holidayDates,
    },
    complianceData.dayOffs
  );

  const otBreakdown = calculateOvertimePay(line.overtimeHours, "weekday");
  const holidayDetails = (line.breakdown.holidayDayDetails ?? []) as HolidayDayPayDetail[];

  return {
    year,
    month,
    employeeName: emp.name,
    components: {
      baseSalary: line.baseSalary,
      jobAllowance: line.jobAllowance,
      fullAttendanceBonus: line.fullAttendanceBonus,
      fixedTotal: line.basePay,
      overtimePay: line.overtimePay,
      restDayOvertimePay: line.restDayOvertimePay,
      restDayWorkDays: line.restDayWorkDays,
      holidayDoublePay: line.holidayDoublePay,
      holidayOvertimePay: line.holidayOvertimePay,
      holidayPayTotal: line.specialAttendancePay,
      laborInsurance: line.laborInsurance,
      healthInsurance: line.healthInsurance,
      personalLeaveDeduction: line.personalLeaveDeduction,
      sickLeaveDeduction: line.sickLeaveDeduction,
      leaveDeductionTotal: line.leaveDeductionTotal,
      grossPay: line.grossPay,
      netPay: line.netPay,
    },
    leaveDeductions: {
      personalLeaveHours: line.personalLeaveHours,
      personalLeaveDeduction: line.personalLeaveDeduction,
      sickLeaveHours: line.sickLeaveHours,
      sickLeaveDeduction: line.sickLeaveDeduction,
      total: line.leaveDeductionTotal,
    },
    hours: {
      regular: line.regularHours,
      overtime: line.overtimeHours,
      overtimeTier2: line.overtimeHours2Tier,
    },
    overtimeDetail: {
      hourlyRate: CLINIC_PAYROLL.OT_HOURLY_RATE,
      tier1: `${CLINIC_PAYROLL.OT_HOURLY_RATE} × 1.34 × ${otBreakdown.tier1Hours}h = ${otBreakdown.tier1Pay}`,
      tier2: `${CLINIC_PAYROLL.OT_HOURLY_RATE} × 1.67 × ${otBreakdown.tier2Hours}h = ${otBreakdown.tier2Pay}`,
    },
    holidayAttendance: {
      days: line.specialAttendanceDays,
      doublePayTotal: line.holidayDoublePay,
      overtimePayTotal: line.holidayOvertimePay,
      totalPay: line.specialAttendancePay,
      doubleDaily: CLINIC_PAYROLL.HOLIDAY_DOUBLE_PAY,
      tier1Hourly: CLINIC_PAYROLL.HOLIDAY_OT_TIER1_HOURLY,
      tier2Hourly: CLINIC_PAYROLL.HOLIDAY_OT_TIER2_HOURLY,
      details: holidayDetails.map((d) => ({
        date: d.date,
        holidayName: d.holidayName,
        totalWorkHours: d.totalWorkHours,
        scenario: d.scenario,
        doublePay: d.doublePay,
        overtimePay: d.overtimePay,
        overtimeHoursTier1: d.overtimeHoursTier1,
        overtimeHoursTier2: d.overtimeHoursTier2,
        totalPay: d.totalPay,
        summary:
          d.scenario === "A"
            ? `工時 ${d.totalWorkHours}h ≤ 8h → 加倍薪 ${d.doublePay} 元`
            : `工時 ${d.totalWorkHours}h > 8h → 加倍 ${d.doublePay} + 延長工時 ${d.overtimePay} 元`,
      })),
    },
    note: "底薪 30,000＋職務 2,000＋全勤 2,000；平日加班 142/h；國定假日出勤 1136/天（≤8h），超過依 190/237 元/h",
  };
}

function parseShiftJoin(raw: unknown): { code?: string; name?: string } | null {
  if (!raw) return null;
  const item = Array.isArray(raw) ? raw[0] : raw;
  return item as { code?: string; name?: string };
}

export function isWorkShiftCode(code: string): boolean {
  return code.length > 0 && !OFF_CODES.has(code);
}
