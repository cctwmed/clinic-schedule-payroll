import { CLINIC_PAYROLL } from "@/lib/payroll/constants";
import type { LeaveRecordRow } from "@/lib/leave/leave-records-service";
import {
  maternityPayRatio,
  type LeaveRecordType,
} from "@/lib/leave/leave-types";

export interface LeavePayrollSummary {
  personalLeaveHours: number;
  personalLeaveDeduction: number;
  sickLeaveHours: number;
  sickLeaveDeduction: number;
  /** 產假時數（核准） */
  maternityLeaveHours: number;
  /** 產假扣款：年資未滿 6 個月為半薪扣款；滿 6 個月為 0 */
  maternityLeaveDeduction: number;
  /** 安胎假時數（不給薪） */
  pregnancyRestHours: number;
  pregnancyRestDeduction: number;
  leaveDeductionTotal: number;
  /** 全薪假別核准時數（特休/婚/喪／產假全薪部分） */
  fullPayLeaveHours: number;
  leaveDetails: {
    leaveType: LeaveRecordType;
    workDate: string;
    hours: number;
    deduction: number;
    note?: string;
  }[];
}

/** 基本時薪：優先員工時薪，否則診所 OT 基準 142 */
export function resolveBaseHourlyRate(hourlyWage: number): number {
  if (hourlyWage > 0) return hourlyWage;
  return CLINIC_PAYROLL.OT_HOURLY_RATE;
}

/**
 * 彙總請假對薪資的影響。
 * - 產假：狀態維持在職；年資滿 6 個月不扣薪，未滿扣半薪；勞健保／勞退不因此歸零
 * - 安胎假：不給薪全額扣款；狀態維持在職，勞健保持續
 */
export function summarizeLeavePayroll(
  leaves: LeaveRecordRow[],
  employeeId: string,
  hourlyWage: number,
  hireDate?: string | null
): LeavePayrollSummary {
  const hourlyRate = resolveBaseHourlyRate(hourlyWage);
  let personalLeaveHours = 0;
  let sickLeaveHours = 0;
  let maternityLeaveHours = 0;
  let maternityLeaveDeduction = 0;
  let pregnancyRestHours = 0;
  let fullPayLeaveHours = 0;
  const leaveDetails: LeavePayrollSummary["leaveDetails"] = [];

  for (const row of leaves) {
    if (row.employee_id !== employeeId || row.status !== "approved") continue;

    const hours = Number(row.total_hours ?? 0);
    if (hours <= 0) continue;

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
    } else if (row.leave_type === "maternity") {
      maternityLeaveHours += hours;
      const ratio = maternityPayRatio(hireDate ?? "", row.work_date);
      // 全薪：不扣；半薪：扣 50% 時薪×時數
      const deduction = ratio === 1 ? 0 : Math.round(hours * hourlyRate * 0.5);
      maternityLeaveDeduction += deduction;
      if (ratio === 1) fullPayLeaveHours += hours;
      leaveDetails.push({
        leaveType: row.leave_type,
        workDate: row.work_date,
        hours,
        deduction,
        note:
          ratio === 1
            ? "產假全薪（年資滿 6 個月），勞健保／勞退持續"
            : "產假半薪（年資未滿 6 個月），勞健保／勞退持續",
      });
    } else if (row.leave_type === "pregnancy_rest") {
      pregnancyRestHours += hours;
      const deduction = Math.round(hours * hourlyRate);
      leaveDetails.push({
        leaveType: row.leave_type,
        workDate: row.work_date,
        hours,
        deduction,
        note: "安胎假不給薪；狀態維持在職，勞健保／勞退持續",
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
  const pregnancyRestDeduction = Math.round(pregnancyRestHours * hourlyRate);

  return {
    personalLeaveHours: round2(personalLeaveHours),
    personalLeaveDeduction,
    sickLeaveHours: round2(sickLeaveHours),
    sickLeaveDeduction,
    maternityLeaveHours: round2(maternityLeaveHours),
    maternityLeaveDeduction,
    pregnancyRestHours: round2(pregnancyRestHours),
    pregnancyRestDeduction,
    leaveDeductionTotal:
      personalLeaveDeduction +
      sickLeaveDeduction +
      maternityLeaveDeduction +
      pregnancyRestDeduction,
    fullPayLeaveHours: round2(fullPayLeaveHours),
    leaveDetails,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function groupLeaveSummariesByEmployee(
  leaves: LeaveRecordRow[],
  employees: { id: string; hourly_wage: number; hire_date?: string | null }[]
): Map<string, LeavePayrollSummary> {
  const map = new Map<string, LeavePayrollSummary>();

  for (const emp of employees) {
    map.set(
      emp.id,
      summarizeLeavePayroll(leaves, emp.id, Number(emp.hourly_wage), emp.hire_date)
    );
  }

  return map;
}
