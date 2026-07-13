import { supabase } from "@/lib/supabase";
import { taipeiToday } from "@/lib/clinic";
import { evaluateClockReminders, type ClockReminder } from "@/lib/clock/reminders";
import { buildShiftClockStatuses } from "@/lib/clock/shift-status";
import type { ExistingClock, WorkAssignment } from "@/lib/clock/session";
import { CLINIC_PAYROLL } from "@/lib/payroll/constants";

export interface MissedClockAlert {
  type: "missing_clock_in" | "missing_clock_out" | "stale_clock_out";
  employeeId: string;
  employeeName: string;
  lineUserId: string | null;
  message: string;
  workDate: string;
  shiftName?: string;
  suggestedAction?: "clock_in" | "clock_out";
}

const OFF_CODES = new Set(["STATUTORY", "REST", "ANNUAL_LEAVE", "CLOSED"]);

function mapAssignments(rows: Record<string, unknown>[]): WorkAssignment[] {
  return rows
    .map((a) => {
      const st = parseShiftJoin(a.shift_types);
      const code = st?.code ?? "";
      if (OFF_CODES.has(code)) return null;
      return {
        id: String(a.id),
        expected_clock_in: String(a.expected_clock_in),
        expected_clock_out: String(a.expected_clock_out),
        shift_code: code,
        shift_name: st?.name ?? "班別",
      };
    })
    .filter((a): a is WorkAssignment => a != null);
}

function parseShiftJoin(raw: unknown): { code?: string; name?: string } | null {
  if (!raw) return null;
  const item = Array.isArray(raw) ? raw[0] : raw;
  return item as { code?: string; name?: string };
}

function addDaysTaipei(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T12:00:00+08:00`);
  d.setTime(d.getTime() + days * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function mapReminderToAlert(
  reminder: ClockReminder,
  employeeId: string,
  employeeName: string,
  lineUserId: string | null
): MissedClockAlert {
  const type =
    reminder.type === "missed_clock_in"
      ? "missing_clock_in"
      : reminder.type === "stale_clock_out"
        ? "stale_clock_out"
        : "missing_clock_out";

  return {
    type,
    employeeId,
    employeeName,
    lineUserId,
    message: reminder.message,
    workDate: reminder.workDate ?? taipeiToday(),
    shiftName: reminder.shiftName,
    suggestedAction:
      reminder.type === "missed_clock_in" ? "clock_in" : "clock_out",
  };
}

/**
 * 與 Web 站內提醒共用 2.5 小時緩衝邏輯，供 Cron 選擇性發送 LINE Push。
 * 策略：Web-First；僅在漏打卡等必要情境才 Push（節省 API 費用）。
 */
export async function findMissedClockAlerts(): Promise<MissedClockAlert[]> {
  const today = taipeiToday();
  const lookbackStart = addDaysTaipei(today, -14);

  const { data: bindings, error } = await supabase
    .from("employee_line_bindings")
    .select("line_user_id, employee_id, employees(id, name, status)")
    .eq("is_active", true);

  if (error) throw new Error(error.message);

  const alerts: MissedClockAlert[] = [];

  for (const binding of bindings ?? []) {
    const emp = parseEmployeeJoin(binding.employees);
    if (!emp || emp.status !== "active") continue;

    const employeeId = binding.employee_id;

    const { data: todayAssign } = await supabase
      .from("shift_assignments")
      .select("id, expected_clock_in, expected_clock_out, shift_types(code, name)")
      .eq("employee_id", employeeId)
      .eq("work_date", today)
      .neq("status", "cancelled")
      .order("expected_clock_in");

    const { data: recentAssign } = await supabase
      .from("shift_assignments")
      .select("id, expected_clock_in, expected_clock_out, shift_types(code, name)")
      .eq("employee_id", employeeId)
      .gte("work_date", lookbackStart)
      .lte("work_date", today)
      .neq("status", "cancelled")
      .order("work_date");

    const assignments = mapAssignments(todayAssign ?? []);
    if (assignments.length === 0 && !(recentAssign?.length ?? 0)) continue;

    const { data: clocks } = await supabase
      .from("clock_records")
      .select("id, assignment_id, clock_type, clocked_at")
      .eq("employee_id", employeeId)
      .gte("clock_date", lookbackStart)
      .lte("clock_date", today)
      .order("clocked_at");

    const recentClocks = (clocks ?? []) as ExistingClock[];
    const todayClocks = recentClocks.filter((c) => c.clocked_at.startsWith(today));
    const shiftStatuses = buildShiftClockStatuses(assignments, todayClocks);

    const reminders = evaluateClockReminders(
      today,
      assignments,
      mapAssignments(recentAssign ?? []),
      recentClocks,
      shiftStatuses
    );

    for (const reminder of reminders) {
      alerts.push(
        mapReminderToAlert(reminder, employeeId, emp.name, binding.line_user_id)
      );
    }
  }

  return alerts;
}

/** 今日是否已對該員工發送同類型 LINE 漏打卡提醒（避免重複 Push） */
export async function wasLineNotifiedToday(
  employeeId: string,
  ruleCode: string
): Promise<boolean> {
  const today = taipeiToday();
  const { count, error } = await supabase
    .from("notifications")
    .select("*", { count: "exact", head: true })
    .eq("employee_id", employeeId)
    .eq("type", "clock_anomaly")
    .gte("sent_at", `${today}T00:00:00+08:00`)
    .contains("payload", { ruleCode });

  if (error) return false;
  return (count ?? 0) > 0;
}

export function isLineMissedClockPushEnabled(): boolean {
  const flag = process.env.ENABLE_LINE_MISSED_CLOCK_PUSH;
  if (flag === "false" || flag === "0") return false;
  return true;
}

export function missedClockRuleCode(type: MissedClockAlert["type"]): string {
  if (type === "missing_clock_in") return "MISSED_CLOCK_IN";
  if (type === "stale_clock_out") return "STALE_CLOCK_OUT";
  return "MISSED_CLOCK_OUT";
}

export { CLINIC_PAYROLL };

function parseEmployeeJoin(raw: unknown): { name: string; status: string } | null {
  if (!raw) return null;
  const emp = Array.isArray(raw) ? raw[0] : raw;
  if (!emp || typeof emp !== "object") return null;
  const e = emp as { name?: string; status?: string };
  return { name: e.name ?? "員工", status: e.status ?? "active" };
}
