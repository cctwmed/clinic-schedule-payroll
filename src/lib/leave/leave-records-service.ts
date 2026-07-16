import { supabase } from "@/lib/supabase";
import { taipeiToday } from "@/lib/clinic";
import {
  HOURS_PER_LEAVE_DAY,
  LEAVE_TYPE_DEFINITIONS,
  type LeaveRecordStatus,
  type LeaveRecordType,
} from "@/lib/leave/leave-types";
import {
  calculateUnusedLeaveDays,
  resolveCurrentLeavePeriod,
  resolveEmployeeArrivalDate,
} from "@/lib/leave/annual-leave";
import { syncEmployeeLeaveRecord } from "@/lib/leave/service";

export interface LeaveRecordRow {
  id: string;
  clinic_id: string;
  employee_id: string;
  employee_name: string;
  employee_no: string;
  leave_type: LeaveRecordType;
  work_date: string;
  start_time: string;
  end_time: string;
  total_hours: number;
  status: LeaveRecordStatus;
  reason: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  created_at: string;
}

const WORK_SHIFT_CODES = new Set(["MORNING", "EVENING", "AFTERNOON"]);

function toTaipeiIso(workDate: string, time = "00:00"): string {
  const t = time.length >= 5 ? time.slice(0, 5) : time;
  return new Date(`${workDate}T${t}:00+08:00`).toISOString();
}

function formatTaipeiDate(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function addDays(dateStr: string, days: number): string {
  const base = new Date(`${dateStr}T12:00:00+08:00`);
  base.setTime(base.getTime() + days * 86_400_000);
  return formatTaipeiDate(base);
}

/** 列出起迄日之間每個曆日（含首尾） */
export function listDatesInRange(startDate: string, endDate: string): string[] {
  if (!startDate || !endDate || endDate < startDate) return [];
  const dates: string[] = [];
  let cursor = startDate;
  while (cursor <= endDate) {
    dates.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return dates;
}

function parseShiftJoin(raw: unknown): { code?: string; planned_hours?: number } | null {
  if (!raw) return null;
  const item = Array.isArray(raw) ? raw[0] : raw;
  return item as { code?: string; planned_hours?: number };
}

/** 依當日班表加總應請假時數 */
export async function resolveLeaveHoursFromSchedule(
  employeeId: string,
  workDate: string
): Promise<number> {
  const { data, error } = await supabase
    .from("shift_assignments")
    .select("shift_types(code, planned_hours)")
    .eq("employee_id", employeeId)
    .eq("work_date", workDate)
    .neq("status", "cancelled");

  if (error) throw new Error(error.message);

  let hours = 0;
  for (const row of data ?? []) {
    const st = parseShiftJoin(row.shift_types);
    if (st?.code && WORK_SHIFT_CODES.has(st.code)) {
      hours += Number(st.planned_hours ?? 0);
    }
  }

  if (hours > 0) return Math.round(hours * 100) / 100;
  return HOURS_PER_LEAVE_DAY;
}

export async function syncEmployeeSpecialLeaveBalance(
  employeeId: string,
  arrivalDate: string
): Promise<number> {
  const record = await syncEmployeeLeaveRecord(employeeId, arrivalDate);
  if (!record) return 0;

  const remainingDays = calculateUnusedLeaveDays(record.total_days, record.used_days);
  const balanceHours = Math.round(remainingDays * HOURS_PER_LEAVE_DAY * 100) / 100;

  await supabase
    .from("employees")
    .update({ special_leave_balance: balanceHours })
    .eq("id", employeeId);

  return balanceHours;
}

async function getYearUsedHours(
  employeeId: string,
  leaveType: LeaveRecordType,
  year: number
): Promise<number> {
  const start = `${year}-01-01`;
  const end = `${year}-12-31`;

  const { data, error } = await supabase
    .from("leave_records")
    .select("total_hours")
    .eq("employee_id", employeeId)
    .eq("leave_type", leaveType)
    .eq("status", "approved")
    .gte("work_date", start)
    .lte("work_date", end);

  if (error) {
    if (error.message.includes("leave_records")) return 0;
    throw new Error(error.message);
  }

  return (data ?? []).reduce((s, r) => s + Number(r.total_hours ?? 0), 0);
}

async function validateLeaveQuota(input: {
  employeeId: string;
  leaveType: LeaveRecordType;
  totalHours: number;
  arrivalDate: string | null;
  excludeRecordId?: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { employeeId, leaveType, totalHours, arrivalDate, excludeRecordId } = input;
  const def = LEAVE_TYPE_DEFINITIONS[leaveType];
  const year = new Date(`${taipeiToday()}T12:00:00+08:00`).getFullYear();

  if (leaveType === "special") {
    if (!arrivalDate) {
      return { ok: false, error: "員工尚未設定到職日，無法申請特休" };
    }
    const period = resolveCurrentLeavePeriod(arrivalDate);
    if (!period) {
      return { ok: false, error: "尚未滿 6 個月，尚無特休資格" };
    }
    const record = await syncEmployeeLeaveRecord(employeeId, arrivalDate);
    const remainingDays = record
      ? calculateUnusedLeaveDays(record.total_days, record.used_days)
      : 0;
    const remainingHours = remainingDays * HOURS_PER_LEAVE_DAY;
    if (totalHours > remainingHours + 0.01) {
      return {
        ok: false,
        error: `特休剩餘 ${remainingDays} 天（${remainingHours} 小時），不足本次 ${totalHours} 小時`,
      };
    }
    return { ok: true };
  }

  if (def.annualLimitHours == null) return { ok: true };

  let used = await getYearUsedHours(employeeId, leaveType, year);
  if (excludeRecordId) {
    const { data: existing } = await supabase
      .from("leave_records")
      .select("total_hours")
      .eq("id", excludeRecordId)
      .maybeSingle();
    if (existing) used -= Number(existing.total_hours ?? 0);
  }

  if (used + totalHours > def.annualLimitHours + 0.01) {
    const limitDays = def.annualLimitHours / HOURS_PER_LEAVE_DAY;
    return {
      ok: false,
      error: `${def.label}年度上限 ${limitDays} 天，已用 ${(used / HOURS_PER_LEAVE_DAY).toFixed(1)} 天`,
    };
  }

  return { ok: true };
}

export async function createLeaveRequest(input: {
  clinicId: string;
  employeeId: string;
  leaveType: LeaveRecordType;
  workDate: string;
  reason?: string;
  totalHours?: number;
  autoApprove?: boolean;
  reviewedBy?: string;
}) {
  const {
    clinicId,
    employeeId,
    leaveType,
    workDate,
    reason,
    autoApprove = false,
    reviewedBy,
  } = input;

  const { data: emp, error: empErr } = await supabase
    .from("employees")
    .select("id, name, arrival_date, hire_date")
    .eq("id", employeeId)
    .single();

  if (empErr || !emp) {
    return { success: false as const, error: "找不到員工" };
  }

  const totalHours =
    input.totalHours ?? (await resolveLeaveHoursFromSchedule(employeeId, workDate));
  const arrival = resolveEmployeeArrivalDate(emp.arrival_date, emp.hire_date);

  const quota = await validateLeaveQuota({
    employeeId,
    leaveType,
    totalHours,
    arrivalDate: arrival,
  });
  if (!quota.ok) return { success: false as const, error: quota.error };

  const payload = {
    clinic_id: clinicId,
    employee_id: employeeId,
    leave_type: leaveType,
    work_date: workDate,
    start_time: toTaipeiIso(workDate, "00:00"),
    end_time: toTaipeiIso(workDate, "23:59"),
    total_hours: totalHours,
    status: autoApprove ? ("approved" as const) : ("pending" as const),
    reason: reason?.trim() || null,
    reviewed_by: autoApprove ? reviewedBy?.trim() || "管理員" : null,
    reviewed_at: autoApprove ? new Date().toISOString() : null,
    review_note: autoApprove ? "管理員直接登記" : null,
  };

  const { data, error } = await supabase
    .from("leave_records")
    .insert(payload)
    .select("id")
    .single();

  if (error) {
    if (error.message.includes("leave_records")) {
      return {
        success: false as const,
        error: "請假模組尚未啟用，請執行 migration 014",
      };
    }
    return { success: false as const, error: error.message };
  }

  if (autoApprove) {
    await applyLeaveApprovalSideEffects(employeeId, leaveType, totalHours, arrival);
  }

  return { success: true as const, recordId: data.id };
}

/** 區間請假：依每日班表分別建立一筆 leave_record */
export async function createLeaveRequestRange(input: {
  clinicId: string;
  employeeId: string;
  leaveType: LeaveRecordType;
  startDate: string;
  endDate: string;
  reason?: string;
  autoApprove?: boolean;
  reviewedBy?: string;
}) {
  const { clinicId, employeeId, leaveType, startDate, endDate, reason, autoApprove, reviewedBy } =
    input;

  const dates = listDatesInRange(startDate, endDate);
  if (dates.length === 0) {
    return { success: false as const, error: "結束日不可早於起始日" };
  }
  if (dates.length > 31) {
    return { success: false as const, error: "單次請假區間最多 31 天，請分批申請" };
  }

  const { data: emp, error: empErr } = await supabase
    .from("employees")
    .select("id, name, arrival_date, hire_date")
    .eq("id", employeeId)
    .single();

  if (empErr || !emp) {
    return { success: false as const, error: "找不到員工" };
  }

  const arrival = resolveEmployeeArrivalDate(emp.arrival_date, emp.hire_date);
  const dayHours: { date: string; hours: number }[] = [];

  for (const date of dates) {
    const hours = await resolveLeaveHoursFromSchedule(employeeId, date);
    dayHours.push({ date, hours });
  }

  const totalHours = dayHours.reduce((s, d) => s + d.hours, 0);
  const quota = await validateLeaveQuota({
    employeeId,
    leaveType,
    totalHours,
    arrivalDate: arrival,
  });
  if (!quota.ok) return { success: false as const, error: quota.error };

  const recordIds: string[] = [];

  for (const { date, hours } of dayHours) {
    const payload = {
      clinic_id: clinicId,
      employee_id: employeeId,
      leave_type: leaveType,
      work_date: date,
      start_time: toTaipeiIso(date, "00:00"),
      end_time: toTaipeiIso(date, "23:59"),
      total_hours: hours,
      status: autoApprove ? ("approved" as const) : ("pending" as const),
      reason: reason?.trim() || null,
      reviewed_by: autoApprove ? reviewedBy?.trim() || "管理員" : null,
      reviewed_at: autoApprove ? new Date().toISOString() : null,
      review_note: autoApprove ? "管理員直接登記" : null,
    };

    const { data, error } = await supabase
      .from("leave_records")
      .insert(payload)
      .select("id")
      .single();

    if (error) {
      if (error.message.includes("leave_records")) {
        return {
          success: false as const,
          error: "請假模組尚未啟用，請執行 migration 014",
        };
      }
      return { success: false as const, error: error.message };
    }

    recordIds.push(data.id);
  }

  if (autoApprove) {
    await applyLeaveApprovalSideEffects(employeeId, leaveType, totalHours, arrival);
  }

  return {
    success: true as const,
    recordIds,
    dayCount: dates.length,
    totalHours,
  };
}

async function applyLeaveApprovalSideEffects(
  employeeId: string,
  leaveType: LeaveRecordType,
  totalHours: number,
  arrivalDate: string | null
) {
  if (leaveType === "special" && arrivalDate) {
    await syncEmployeeSpecialLeaveBalance(employeeId, arrivalDate);
    return;
  }

  if (leaveType === "sick") {
    const { data: emp } = await supabase
      .from("employees")
      .select("sick_leave_used_this_year")
      .eq("id", employeeId)
      .single();
    const used = Number(emp?.sick_leave_used_this_year ?? 0) + totalHours;
    await supabase
      .from("employees")
      .update({ sick_leave_used_this_year: used })
      .eq("id", employeeId);
    return;
  }

  if (leaveType === "personal") {
    const { data: emp } = await supabase
      .from("employees")
      .select("personal_leave_used_this_year")
      .eq("id", employeeId)
      .single();
    const used = Number(emp?.personal_leave_used_this_year ?? 0) + totalHours;
    await supabase
      .from("employees")
      .update({ personal_leave_used_this_year: used })
      .eq("id", employeeId);
  }
}

export async function reviewLeaveRecord(input: {
  recordId: string;
  approved: boolean;
  reviewedBy: string;
  reviewNote?: string;
}) {
  const { recordId, approved, reviewedBy, reviewNote } = input;

  const { data: record, error: fetchErr } = await supabase
    .from("leave_records")
    .select("*")
    .eq("id", recordId)
    .single();

  if (fetchErr || !record) {
    return { success: false as const, error: "找不到請假紀錄" };
  }
  if (record.status !== "pending") {
    return { success: false as const, error: "此申請已處理" };
  }

  if (approved) {
    const { data: emp } = await supabase
      .from("employees")
      .select("arrival_date, hire_date")
      .eq("id", record.employee_id)
      .single();
    const arrival = resolveEmployeeArrivalDate(emp?.arrival_date, emp?.hire_date);

    const quota = await validateLeaveQuota({
      employeeId: record.employee_id,
      leaveType: record.leave_type as LeaveRecordType,
      totalHours: Number(record.total_hours),
      arrivalDate: arrival,
      excludeRecordId: recordId,
    });
    if (!quota.ok) return { success: false as const, error: quota.error };
  }

  const { error: updErr } = await supabase
    .from("leave_records")
    .update({
      status: approved ? "approved" : "rejected",
      reviewed_by: reviewedBy.trim() || "院長",
      reviewed_at: new Date().toISOString(),
      review_note: reviewNote?.trim() || (approved ? "核准" : "駁回"),
    })
    .eq("id", recordId);

  if (updErr) return { success: false as const, error: updErr.message };

  if (approved) {
    const { data: emp } = await supabase
      .from("employees")
      .select("arrival_date, hire_date")
      .eq("id", record.employee_id)
      .single();
    const arrival = resolveEmployeeArrivalDate(emp?.arrival_date, emp?.hire_date);
    await applyLeaveApprovalSideEffects(
      record.employee_id,
      record.leave_type as LeaveRecordType,
      Number(record.total_hours),
      arrival
    );
  }

  return { success: true as const };
}

export async function fetchLeaveRecords(
  clinicId: string,
  options?: {
    status?: LeaveRecordStatus;
    year?: number;
    month?: number;
    employeeId?: string;
  }
): Promise<LeaveRecordRow[]> {
  let query = supabase
    .from("leave_records")
    .select(
      `
      id,
      clinic_id,
      employee_id,
      leave_type,
      work_date,
      start_time,
      end_time,
      total_hours,
      status,
      reason,
      reviewed_by,
      reviewed_at,
      review_note,
      created_at,
      employees(name, employee_no)
    `
    )
    .eq("clinic_id", clinicId)
    .order("work_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (options?.status) query = query.eq("status", options.status);
  if (options?.employeeId) query = query.eq("employee_id", options.employeeId);

  if (options?.year && options?.month) {
    const start = `${options.year}-${String(options.month).padStart(2, "0")}-01`;
    const lastDay = new Date(options.year, options.month, 0).getDate();
    const end = `${options.year}-${String(options.month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
    query = query.gte("work_date", start).lte("work_date", end);
  }

  const { data, error } = await query;

  if (error) {
    if (error.message.includes("leave_records")) return [];
    throw new Error(error.message);
  }

  return (data ?? []).map(mapLeaveRecord);
}

export async function fetchApprovedLeavesForPeriod(
  clinicId: string,
  periodStart: string,
  periodEnd: string
): Promise<LeaveRecordRow[]> {
  const { data, error } = await supabase
    .from("leave_records")
    .select(
      `
      id,
      clinic_id,
      employee_id,
      leave_type,
      work_date,
      start_time,
      end_time,
      total_hours,
      status,
      reason,
      reviewed_by,
      reviewed_at,
      review_note,
      created_at,
      employees(name, employee_no)
    `
    )
    .eq("clinic_id", clinicId)
    .eq("status", "approved")
    .gte("work_date", periodStart)
    .lte("work_date", periodEnd);

  if (error) {
    if (error.message.includes("leave_records")) return [];
    throw new Error(error.message);
  }

  return (data ?? []).map(mapLeaveRecord);
}

export interface EmployeeLeaveBalanceRow {
  employeeId: string;
  employeeName: string;
  employeeNo: string;
  specialLeaveBalanceHours: number;
  specialLeaveBalanceDays: number;
  sickLeaveUsedHours: number;
  personalLeaveUsedHours: number;
}

export async function fetchEmployeeLeaveBalances(
  clinicId: string
): Promise<EmployeeLeaveBalanceRow[]> {
  const { data: employees, error } = await supabase
    .from("employees")
    .select(
      "id, name, employee_no, arrival_date, hire_date, special_leave_balance, sick_leave_used_this_year, personal_leave_used_this_year"
    )
    .eq("clinic_id", clinicId)
    .eq("status", "active")
    .order("employee_no");

  if (error) throw new Error(error.message);

  const rows: EmployeeLeaveBalanceRow[] = [];

  for (const emp of employees ?? []) {
    const arrival = resolveEmployeeArrivalDate(emp.arrival_date, emp.hire_date);
    let balanceHours = Number(emp.special_leave_balance ?? 0);
    if (arrival) {
      balanceHours = await syncEmployeeSpecialLeaveBalance(emp.id, arrival);
    }

    rows.push({
      employeeId: emp.id,
      employeeName: emp.name,
      employeeNo: emp.employee_no,
      specialLeaveBalanceHours: balanceHours,
      specialLeaveBalanceDays: Math.round((balanceHours / HOURS_PER_LEAVE_DAY) * 10) / 10,
      sickLeaveUsedHours: Number(emp.sick_leave_used_this_year ?? 0),
      personalLeaveUsedHours: Number(emp.personal_leave_used_this_year ?? 0),
    });
  }

  return rows;
}

function mapLeaveRecord(r: Record<string, unknown>): LeaveRecordRow {
  const emp = parseEmployeeJoin(r.employees);
  return {
    id: String(r.id),
    clinic_id: String(r.clinic_id),
    employee_id: String(r.employee_id),
    employee_name: emp?.name ?? "—",
    employee_no: emp?.employee_no ?? "",
    leave_type: r.leave_type as LeaveRecordType,
    work_date: String(r.work_date),
    start_time: String(r.start_time),
    end_time: String(r.end_time),
    total_hours: Number(r.total_hours ?? 0),
    status: r.status as LeaveRecordStatus,
    reason: r.reason ? String(r.reason) : null,
    reviewed_by: r.reviewed_by ? String(r.reviewed_by) : null,
    reviewed_at: r.reviewed_at ? String(r.reviewed_at) : null,
    review_note: r.review_note ? String(r.review_note) : null,
    created_at: String(r.created_at),
  };
}

function parseEmployeeJoin(raw: unknown): { name?: string; employee_no?: string } | null {
  if (!raw) return null;
  const item = Array.isArray(raw) ? raw[0] : raw;
  return item as { name?: string; employee_no?: string };
}
