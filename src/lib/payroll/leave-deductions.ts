import { CLINIC_PAYROLL } from "@/lib/payroll/constants";
import type { LeaveRecordRow } from "@/lib/leave/leave-records-service";
import type { LeaveRecordType } from "@/lib/leave/leave-types";

export interface LeavePayrollSummary {
  personalLeaveHours: number;
  personalLeaveDeduction: number;
  sickLeaveHours: number;
  sickLeaveDeduction: number;
  leaveDeductionTotal: number;
  /** 全薪假別核准時數（特休/婚/喪，供明細） */
  fullPayLeaveHours: number;
  leaveDetails: {
    leaveType: LeaveRecordType;
    workDate: string;
    hours: number;
    deduction: number;
  }[];
}

/** 基本時薪：優先員工時薪，否則診所 OT 基準 142 */
export function resolveBaseHourlyRate(hourlyWage: number): number {
  if (hourlyWage > 0) return hourlyWage;
  return CLINIC_PAYROLL.OT_HOURLY_RATE;
}

export function summarizeLeavePayroll(
  leaves: LeaveRecordRow[],
  employeeId: string,
  hourlyWage: number
): LeavePayrollSummary {
  const hourlyRate = resolveBaseHourlyRate(hourlyWage);
  let personalLeaveHours = 0;
  let sickLeaveHours = 0;
  let fullPayLeaveHours = 0;
  const leaveDetails: LeavePayrollSummary["leaveDetails"] = [];

  for (const row of leaves) {
    if (row.employee_id !== employeeId || row.status !== "approved") continue;

    const hours = Number(row.total_hours ?? 0);
    if (row.leave_type === "personal") {
      personalLeaveHours += hours;
      const deduction = Math.round(hours * hourlyRate);
      leaveDetails.push({
        leaveType: row.leave_type,
        workDate: row.work_date,
        hours,
        deduction,
      });
    } else if (row.leave_type === "sick") {
      sickLeaveHours += hours;
      const deduction = Math.round(hours * hourlyRate * 0.5);
      leaveDetails.push({
        leaveType: row.leave_type,
        workDate: row.work_date,
        hours,
        deduction,
      });
    } else {
      fullPayLeaveHours += hours;
      leaveDetails.push({
        leaveType: row.leave_type,
        workDate: row.work_date,
        hours,
        deduction: 0,
      });
    }
  }

  const personalLeaveDeduction = Math.round(personalLeaveHours * hourlyRate);
  const sickLeaveDeduction = Math.round(sickLeaveHours * hourlyRate * 0.5);

  return {
    personalLeaveHours: round2(personalLeaveHours),
    personalLeaveDeduction,
    sickLeaveHours: round2(sickLeaveHours),
    sickLeaveDeduction,
    leaveDeductionTotal: personalLeaveDeduction + sickLeaveDeduction,
    fullPayLeaveHours: round2(fullPayLeaveHours),
    leaveDetails,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function groupLeaveSummariesByEmployee(
  leaves: LeaveRecordRow[],
  employees: { id: string; hourly_wage: number }[]
): Map<string, LeavePayrollSummary> {
  const wageMap = new Map(employees.map((e) => [e.id, Number(e.hourly_wage)]));
  const map = new Map<string, LeavePayrollSummary>();

  for (const emp of employees) {
    map.set(
      emp.id,
      summarizeLeavePayroll(leaves, emp.id, wageMap.get(emp.id) ?? 0)
    );
  }

  return map;
}
