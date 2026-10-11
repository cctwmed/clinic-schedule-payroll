import { supabase } from "@/lib/supabase";

export interface OvertimeRequestRow {
  id: string;
  employee_id: string;
  work_date: string;
  start_time: string;
  end_time: string;
  duration_minutes: number;
  reason: string | null;
  status: string;
  created_at: string;
  employee_name?: string;
}

export async function createOvertimeRequest(input: {
  clinicId: string;
  employeeId: string;
  lineUserId?: string;
  workDate: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  reason?: string;
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const { data, error } = await supabase
    .from("overtime_requests")
    .insert({
      clinic_id: input.clinicId,
      employee_id: input.employeeId,
      line_user_id: input.lineUserId ?? null,
      work_date: input.workDate,
      start_time: input.startTime.length === 5 ? `${input.startTime}:00` : input.startTime,
      end_time: input.endTime.length === 5 ? `${input.endTime}:00` : input.endTime,
      duration_minutes: input.durationMinutes,
      reason: input.reason?.trim() || null,
      status: "pending",
    })
    .select("id")
    .single();

  if (error) {
    if (error.message.includes("overtime_requests") || error.message.includes("schema cache")) {
      return {
        ok: false,
        error: "加班申請尚未啟用。請管理員到 Supabase SQL Editor 執行桌面上的「啟動加班與審核.sql」",
      };
    }
    return { ok: false, error: error.message };
  }
  return { ok: true, id: data.id };
}

export async function listMyPendingOvertime(employeeId: string): Promise<OvertimeRequestRow[]> {
  const { data, error } = await supabase
    .from("overtime_requests")
    .select(
      "id, employee_id, work_date, start_time, end_time, duration_minutes, reason, status, created_at"
    )
    .eq("employee_id", employeeId)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) return [];
  return (data ?? []).map((row) => ({
    id: row.id,
    employee_id: row.employee_id,
    work_date: row.work_date,
    start_time: String(row.start_time).slice(0, 5),
    end_time: String(row.end_time).slice(0, 5),
    duration_minutes: row.duration_minutes,
    reason: row.reason,
    status: row.status,
    created_at: row.created_at,
  }));
}

export async function countPendingOvertime(employeeId: string): Promise<number> {
  const { count, error } = await supabase
    .from("overtime_requests")
    .select("id", { count: "exact", head: true })
    .eq("employee_id", employeeId)
    .eq("status", "pending");
  if (error) return 0;
  return count ?? 0;
}

export async function listPendingOvertimeRequests(
  clinicId: string
): Promise<OvertimeRequestRow[]> {
  const { data, error } = await supabase
    .from("overtime_requests")
    .select(
      "id, employee_id, work_date, start_time, end_time, duration_minutes, reason, status, created_at"
    )
    .eq("clinic_id", clinicId)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    if (error.message.includes("overtime_requests") || error.message.includes("schema cache")) {
      throw new Error("加班申請表尚未建立。請到 Supabase SQL Editor 執行「啟動加班與審核.sql」");
    }
    throw new Error(error.message);
  }

  const employeeIds = [...new Set((data ?? []).map((row) => String(row.employee_id)))];
  const nameById = new Map<string, string>();
  if (employeeIds.length > 0) {
    const { data: emps } = await supabase
      .from("employees")
      .select("id, name")
      .in("id", employeeIds);
    for (const emp of emps ?? []) {
      nameById.set(String(emp.id), emp.name ?? "同仁");
    }
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    employee_id: row.employee_id,
    work_date: row.work_date,
    start_time: String(row.start_time).slice(0, 5),
    end_time: String(row.end_time).slice(0, 5),
    duration_minutes: row.duration_minutes,
    reason: row.reason,
    status: row.status,
    created_at: row.created_at,
    employee_name: nameById.get(String(row.employee_id)) ?? "同仁",
  }));
}

export async function reviewOvertimeRequest(
  id: string,
  status: "approved" | "rejected",
  reviewNote?: string
): Promise<{ success: true } | { success: false; error: string }> {
  const { error } = await supabase
    .from("overtime_requests")
    .update({
      status,
      reviewed_at: new Date().toISOString(),
      review_note: reviewNote ?? null,
    })
    .eq("id", id)
    .eq("status", "pending");

  if (error) return { success: false, error: error.message };
  return { success: true };
}
