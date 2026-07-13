import { supabase } from "@/lib/supabase";
import { taipeiToday } from "@/lib/clinic";
import { pushLineMessage, buildMissedClockReminderMessage } from "@/lib/line/client";
import {
  findMissedClockAlerts,
  isLineMissedClockPushEnabled,
  missedClockRuleCode,
  wasLineNotifiedToday,
  type MissedClockAlert,
} from "@/lib/alerts/missed-clock-alerts";

export interface AlertResult {
  type: "missing_clock_in" | "missing_clock_out" | "stale_clock_out" | "missing_break";
  employeeId: string;
  employeeName: string;
  lineUserId: string | null;
  message: string;
  sent: boolean;
  skipped?: boolean;
  skipReason?: string;
  error?: string;
}

/** 連續工作 4 小時未休息（僅 Web 紀錄，不 Push LINE 以節省費用） */
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

    results.push({
      type: "missing_break",
      employeeId: clockIn.employee_id,
      employeeName: employee?.name ?? "員工",
      lineUserId: null,
      message: "您已連續工作超過 4 小時，請記得休息或打下班卡。",
      sent: false,
      skipped: true,
      skipReason: "休息提醒僅站內顯示，不發 LINE Push",
    });
  }

  return results;
}

/**
 * 執行漏打卡提醒：
 * 1. Web-First：同仁開啟 LIFF 時由 evaluateClockReminders 顯示橫幅
 * 2. 必要時 LINE Push：超過表定時間 2.5 小時仍漏打卡（每類型每日最多 1 則）
 */
export async function runClockAlerts(): Promise<{
  alerts: AlertResult[];
  sentCount: number;
  skippedCount: number;
}> {
  const missedAlerts = await findMissedClockAlerts();
  const breakAlerts = await checkMissingBreak();

  const lineEnabled = isLineMissedClockPushEnabled();
  const results: AlertResult[] = [...breakAlerts];
  let sentCount = 0;
  let skippedCount = breakAlerts.length;

  for (const alert of missedAlerts) {
    const ruleCode = missedClockRuleCode(alert.type);
    const base: AlertResult = {
      type: alert.type,
      employeeId: alert.employeeId,
      employeeName: alert.employeeName,
      lineUserId: alert.lineUserId,
      message: alert.message,
      sent: false,
    };

    if (!lineEnabled) {
      results.push({
        ...base,
        skipped: true,
        skipReason: "ENABLE_LINE_MISSED_CLOCK_PUSH=false，僅站內提醒",
      });
      skippedCount++;
      continue;
    }

    if (!alert.lineUserId) {
      results.push({ ...base, skipped: true, skipReason: "未綁定 LINE" });
      skippedCount++;
      continue;
    }

    if (await wasLineNotifiedToday(alert.employeeId, ruleCode)) {
      results.push({ ...base, skipped: true, skipReason: "今日已 Push 過" });
      skippedCount++;
      continue;
    }

    const msg = buildMissedClockReminderMessage(
      alert.employeeName,
      alert.message,
      alert.suggestedAction
    );
    const pushResult = await pushLineMessage(alert.lineUserId, [msg]);

    if (pushResult.ok) {
      sentCount++;
      results.push({ ...base, sent: true });

      const { data: employee } = await supabase
        .from("employees")
        .select("clinic_id")
        .eq("id", alert.employeeId)
        .single();

      if (employee?.clinic_id) {
        await supabase.from("notifications").insert({
          employee_id: alert.employeeId,
          clinic_id: employee.clinic_id,
          type: "clock_anomaly",
          title: "漏打卡提醒",
          body: alert.message,
          payload: { ruleCode, alertType: alert.type, workDate: alert.workDate },
          sent_at: new Date().toISOString(),
        });
      }
    } else {
      results.push({ ...base, error: pushResult.error });
    }
  }

  return { alerts: results, sentCount, skippedCount };
}

function parseEmployeeJoin(raw: unknown): { name: string } | null {
  if (!raw) return null;
  const emp = Array.isArray(raw) ? raw[0] : raw;
  if (!emp || typeof emp !== "object") return null;
  return { name: (emp as { name?: string }).name ?? "員工" };
}

export type { MissedClockAlert };
