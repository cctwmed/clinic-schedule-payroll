import { supabase } from "@/lib/supabase";
import {
  calculateAnnualLeavePayout,
  calculateUnusedLeaveDays,
  resolveCurrentLeavePeriod,
  resolveEmployeeArrivalDate,
  taipeiToday,
} from "@/lib/leave/annual-leave";
import type { AnnualLeaveRecord, EmployeeLeaveSummary } from "@/types/leave";
import { monthPeriod } from "@/lib/compliance/load-compliance-data";

export async function syncEmployeeLeaveRecord(
  employeeId: string,
  arrivalDate: string,
  asOfDate?: string
): Promise<AnnualLeaveRecord | null> {
  const period = resolveCurrentLeavePeriod(arrivalDate, asOfDate);
  if (!period) return null;

  const usedDays = await countAnnualLeaveUsedDays(
    employeeId,
    period.periodStart,
    period.periodEnd
  );

  const payload = {
    employee_id: employeeId,
    period_start: period.periodStart,
    period_end: period.periodEnd,
    expiry_date: period.expiryDate,
    total_days: period.totalDays,
    used_days: usedDays,
  };

  const { data, error } = await supabase
    .from("annual_leave_records")
    .upsert(payload, { onConflict: "employee_id,period_start" })
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return mapRecord(data);
}

export async function countAnnualLeaveUsedDays(
  employeeId: string,
  periodStart: string,
  periodEnd: string
): Promise<number> {
  const { data, error } = await supabase
    .from("shift_assignments")
    .select("work_date, shift_types(code)")
    .eq("employee_id", employeeId)
    .gte("work_date", periodStart)
    .lte("work_date", periodEnd)
    .neq("status", "cancelled");

  if (error) throw new Error(error.message);

  let days = 0;
  for (const row of data ?? []) {
    const st = parseShiftJoin(row.shift_types);
    if (st?.code === "ANNUAL_LEAVE") days += 1;
  }
  return days;
}

export async function fetchEmployeeLeaveSummaries(
  clinicId: string,
  asOfDate?: string
): Promise<EmployeeLeaveSummary[]> {
  const asOf = asOfDate ?? taipeiToday();

  const { data: employees, error } = await supabase
    .from("employees")
    .select("id, employee_no, name, arrival_date, hire_date, status, resign_date")
    .eq("clinic_id", clinicId)
    .neq("status", "resigned")
    .order("employee_no");

  if (error) throw new Error(error.message);

  const summaries: EmployeeLeaveSummary[] = [];

  for (const emp of employees ?? []) {
    const arrival = resolveEmployeeArrivalDate(emp.arrival_date, emp.hire_date);
    if (!arrival) continue;

    const record = await syncEmployeeLeaveRecord(emp.id, arrival, asOf);
    const period = resolveCurrentLeavePeriod(arrival, asOf);

    summaries.push({
      employeeId: emp.id,
      employeeNo: emp.employee_no,
      employeeName: emp.name,
      arrivalDate: arrival,
      period,
      record,
      remainingDays: record
        ? calculateUnusedLeaveDays(record.total_days, record.used_days)
        : 0,
    });
  }

  return summaries;
}

export interface LeavePayoutDue {
  employeeId: string;
  employeeName: string;
  recordId: string;
  unusedDays: number;
  payoutAmount: number;
  reason: "expiry" | "resignation";
  expiryDate: string;
}

/** 結算當月到期或離職員工之未休畢特休 */
export async function findLeavePayoutsDue(
  clinicId: string,
  year: number,
  month: number
): Promise<LeavePayoutDue[]> {
  const { start, end } = monthPeriod(year, month);
  const payouts: LeavePayoutDue[] = [];

  const { data: expiring, error: expErr } = await supabase
    .from("annual_leave_records")
    .select("*, employees!inner(id, name, clinic_id, status)")
    .eq("employees.clinic_id", clinicId)
    .gte("expiry_date", start)
    .lte("expiry_date", end)
    .is("settled_at", null);

  if (expErr) throw new Error(expErr.message);

  for (const row of expiring ?? []) {
    const unused = calculateUnusedLeaveDays(Number(row.total_days), Number(row.used_days));
    if (unused <= 0) continue;
    const emp = parseEmployeeJoin(row.employees);
    payouts.push({
      employeeId: row.employee_id,
      employeeName: emp?.name ?? "—",
      recordId: row.id,
      unusedDays: unused,
      payoutAmount: calculateAnnualLeavePayout(unused),
      reason: "expiry",
      expiryDate: row.expiry_date,
    });
  }

  const { data: resigned, error: resErr } = await supabase
    .from("employees")
    .select("id, name, arrival_date, hire_date, resign_date")
    .eq("clinic_id", clinicId)
    .eq("status", "resigned")
    .gte("resign_date", start)
    .lte("resign_date", end);

  if (resErr) throw new Error(resErr.message);

  for (const emp of resigned ?? []) {
    const arrival = resolveEmployeeArrivalDate(emp.arrival_date, emp.hire_date);
    if (!arrival || !emp.resign_date) continue;

    const record = await syncEmployeeLeaveRecord(emp.id, arrival, emp.resign_date);
    if (!record || record.settled_at) continue;

    const unused = calculateUnusedLeaveDays(record.total_days, record.used_days);
    if (unused <= 0) continue;

    if (payouts.some((p) => p.recordId === record.id)) continue;

    payouts.push({
      employeeId: emp.id,
      employeeName: emp.name,
      recordId: record.id,
      unusedDays: unused,
      payoutAmount: calculateAnnualLeavePayout(unused),
      reason: "resignation",
      expiryDate: record.expiry_date,
    });
  }

  return payouts;
}

export async function markLeaveRecordSettled(
  recordId: string,
  unusedDays: number,
  payoutAmount: number,
  payrollRunId: string
) {
  const { error } = await supabase
    .from("annual_leave_records")
    .update({
      payout_days: unusedDays,
      payout_amount: payoutAmount,
      payout_payroll_run_id: payrollRunId,
      settled_at: new Date().toISOString(),
      note: "特休未休畢折現結算",
    })
    .eq("id", recordId);

  if (error) throw new Error(error.message);
}

function mapRecord(row: Record<string, unknown>): AnnualLeaveRecord {
  return {
    id: String(row.id),
    employee_id: String(row.employee_id),
    period_start: String(row.period_start),
    period_end: String(row.period_end),
    expiry_date: String(row.expiry_date),
    total_days: Number(row.total_days),
    used_days: Number(row.used_days),
    payout_days: row.payout_days != null ? Number(row.payout_days) : null,
    payout_amount: row.payout_amount != null ? Number(row.payout_amount) : null,
    payout_payroll_run_id: row.payout_payroll_run_id
      ? String(row.payout_payroll_run_id)
      : null,
    settled_at: row.settled_at ? String(row.settled_at) : null,
    note: row.note ? String(row.note) : null,
  };
}

function parseShiftJoin(raw: unknown): { code?: string } | null {
  if (!raw) return null;
  const item = Array.isArray(raw) ? raw[0] : raw;
  return item as { code?: string };
}

function parseEmployeeJoin(raw: unknown): { name?: string } | null {
  if (!raw) return null;
  const item = Array.isArray(raw) ? raw[0] : raw;
  return item as { name?: string };
}

export async function ensureAnnualLeaveShiftType(clinicId: string): Promise<string> {
  const { data: existing } = await supabase
    .from("shift_types")
    .select("id")
    .eq("clinic_id", clinicId)
    .eq("code", "ANNUAL_LEAVE")
    .maybeSingle();

  if (existing?.id) return existing.id;

  const { data: created, error } = await supabase
    .from("shift_types")
    .insert({
      clinic_id: clinicId,
      code: "ANNUAL_LEAVE",
      name: "特休",
      category: "custom",
      default_clock_in: null,
      default_clock_out: null,
      planned_hours: 0,
      color_hex: "#10B981",
      sort_order: 12,
      is_active: true,
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);
  return created.id;
}

export async function assignAnnualLeaveDay(
  employeeId: string,
  workDate: string,
  clinicId: string
) {
  const shiftTypeId = await ensureAnnualLeaveShiftType(clinicId);
  const work = new Date(`${workDate}T12:00:00+08:00`);
  const year = work.getFullYear();
  const month = work.getMonth() + 1;

  let { data: schedule } = await supabase
    .from("schedules")
    .select("id, status")
    .eq("clinic_id", clinicId)
    .eq("year", year)
    .eq("month", month)
    .maybeSingle();

  if (!schedule) {
    const { data: created, error } = await supabase
      .from("schedules")
      .insert({ clinic_id: clinicId, year, month, status: "draft" })
      .select("id, status")
      .single();
    if (error) throw new Error(error.message);
    schedule = created;
  }

  if (schedule.status === "published") {
    return { success: false as const, error: "該月班表已發布，請先調整為草稿或聯繫管理員" };
  }

  const { data: existing } = await supabase
    .from("shift_assignments")
    .select("id")
    .eq("schedule_id", schedule.id)
    .eq("work_date", workDate)
    .eq("employee_id", employeeId)
    .eq("shift_type_id", shiftTypeId)
    .maybeSingle();

  if (!existing) {
    const { error: insErr } = await supabase.from("shift_assignments").insert({
      schedule_id: schedule.id,
      employee_id: employeeId,
      shift_type_id: shiftTypeId,
      work_date: workDate,
      expected_clock_in: "00:00",
      expected_clock_out: "00:00",
      status: "scheduled",
      note: "特休",
    });
    if (insErr) throw new Error(insErr.message);
  }

  const { data: emp } = await supabase
    .from("employees")
    .select("arrival_date, hire_date")
    .eq("id", employeeId)
    .single();

  const arrival = resolveEmployeeArrivalDate(emp?.arrival_date, emp?.hire_date);
  if (arrival) await syncEmployeeLeaveRecord(employeeId, arrival, workDate);

  return { success: true as const };
}
