import { supabase } from "@/lib/supabase";
import { taipeiToday } from "@/lib/clinic";
import { pushLineMessage, buildClockReminderMessage } from "@/lib/line/client";

export interface AlertResult {
  type: "missing_clock_in" | "missing_break";
  employeeId: string;
  employeeName: string;
  lineUserId: string | null;
  message: string;
  sent: boolean;
  error?: string;
}

/** 忘記打卡：今日有排班且班別已開始，但無 clock_in 紀錄 */
export async function checkMissingClockIn(): Promise<AlertResult[]> {
  const today = taipeiToday();
  const now = new Date();
  const taipeiTime = now.toLocaleTimeString("en-GB", { timeZone: "Asia/Taipei", hour12: false });

  const { data: assignments, error } = await supabase
    .from("shift_assignments")
    .select("id, employee_id, expected_clock_in, employees(name, employee_line_bindings(line_user_id, is_active))")
    .eq("work_date", today)
    .neq("status", "cancelled");

  if (error) throw new Error(error.message);

  const results: AlertResult[] = [];

  for (const assignment of assignments ?? []) {
    const expectedIn = String(assignment.expected_clock_in).slice(0, 5);
    if (taipeiTime < expectedIn) continue;

    const employee = parseEmployeeJoin(assignment.employees);
    const binding = employee?.bindings?.find((b) => b.is_active);

    const { count } = await supabase
      .from("clock_records")
      .select("*", { count: "exact", head: true })
      .eq("employee_id", assignment.employee_id)
      .eq("clock_type", "clock_in")
      .eq("clock_date", today);

    if ((count ?? 0) > 0) continue;

    const message = `您今日 ${expectedIn} 有排班，但尚未打卡，請盡快完成上班打卡。`;
    results.push({
      type: "missing_clock_in",
      employeeId: assignment.employee_id,
      employeeName: employee?.name ?? "員工",
      lineUserId: binding?.line_user_id ?? null,
      message,
      sent: false,
    });
  }

  return results;
}

/** 連續工作 4 小時未休息：有 clock_in 但無 break_start / clock_out，且已超過 4 小時 */
export async function checkMissingBreak(): Promise<AlertResult[]> {
  const today = taipeiToday();

  const { data: clockIns, error } = await supabase
    .from("clock_records")
    .select("id, employee_id, clocked_at, employees(name, employee_line_bindings(line_user_id, is_active))")
    .eq("clock_type", "clock_in")
    .eq("clock_date", today)
    .order("clocked_at", { ascending: false });

  if (error) throw new Error(error.message);

  const results: AlertResult[] = [];
  const seen = new Set<string>();

  for (const clockIn of clockIns ?? []) {
    if (seen.has(clockIn.employee_id)) continue;
    seen.add(clockIn.employee_id);

    const { count: outCount } = await supabase
      .from("clock_records")
      .select("*", { count: "exact", head: true })
      .eq("employee_id", clockIn.employee_id)
      .eq("clock_date", today)
      .in("clock_type", ["clock_out", "break_start"])
      .gte("clocked_at", clockIn.clocked_at);

    if ((outCount ?? 0) > 0) continue;

    const hoursWorked =
      (Date.now() - new Date(clockIn.clocked_at).getTime()) / (1000 * 60 * 60);
    if (hoursWorked < 4) continue;

    const employee = parseEmployeeJoin(clockIn.employees);
    const binding = employee?.bindings?.find((b) => b.is_active);

    const message = `您已連續工作超過 4 小時，請記得休息或打下班卡。`;
    results.push({
      type: "missing_break",
      employeeId: clockIn.employee_id,
      employeeName: employee?.name ?? "員工",
      lineUserId: binding?.line_user_id ?? null,
      message,
      sent: false,
    });
  }

  return results;
}

export async function runClockAlerts(): Promise<{
  alerts: AlertResult[];
  sentCount: number;
}> {
  const missingClock = await checkMissingClockIn();
  const missingBreak = await checkMissingBreak();
  const allAlerts = [...missingClock, ...missingBreak];

  let sentCount = 0;

  for (const alert of allAlerts) {
    if (!alert.lineUserId) {
      alert.error = "未綁定 LINE";
      continue;
    }

    const msg = buildClockReminderMessage(alert.employeeName, alert.message);
    const result = await pushLineMessage(alert.lineUserId, [msg]);

    if (result.ok) {
      alert.sent = true;
      sentCount++;

      const { data: employee } = await supabase
        .from("employees")
        .select("clinic_id")
        .eq("id", alert.employeeId)
        .single();

      const { data: rule } = await supabase
        .from("compliance_rules")
        .select("id")
        .is("clinic_id", null)
        .eq("rule_code", alert.type === "missing_clock_in" ? "MISSING_CLOCK_OUT" : "MAX_DAILY_HOURS")
        .maybeSingle();

      if (employee?.clinic_id && rule?.id) {
        await supabase.from("compliance_alerts").insert({
          clinic_id: employee.clinic_id,
          rule_id: rule.id,
          employee_id: alert.employeeId,
          alert_date: taipeiToday(),
          severity: "warning",
          rule_code: alert.type,
          message: alert.message,
          status: "open",
          notified_at: new Date().toISOString(),
          notified_via: ["line"],
        });
      }
    } else {
      alert.error = result.error;
    }
  }

  return { alerts: allAlerts, sentCount };
}

function parseEmployeeJoin(raw: unknown): {
  name: string;
  bindings?: { line_user_id: string; is_active: boolean }[];
} | null {
  if (!raw) return null;
  const emp = Array.isArray(raw) ? raw[0] : raw;
  if (!emp || typeof emp !== "object") return null;
  const e = emp as { name?: string; employee_line_bindings?: unknown };
  const bindingsRaw = e.employee_line_bindings;
  const bindings = Array.isArray(bindingsRaw)
    ? (bindingsRaw as { line_user_id: string; is_active: boolean }[])
    : bindingsRaw
      ? [bindingsRaw as { line_user_id: string; is_active: boolean }]
      : [];
  return { name: e.name ?? "員工", bindings };
}
