import { supabase } from "@/lib/supabase";
import {
  evaluateLateForManualCorrection,
  type ClockType,
  type WorkAssignment,
} from "@/lib/clock/session";

function parseShiftJoin(raw: unknown): { code: string; name: string } | null {
  if (!raw) return null;
  const item = Array.isArray(raw) ? raw[0] : raw;
  if (!item || typeof item !== "object") return null;
  const s = item as { code?: string; name?: string };
  return { code: s.code ?? "", name: s.name ?? "班別" };
}

export async function applyClockRecordCorrection(input: {
  recordId: string;
  clockedAt: string;
  clockType: ClockType;
  note?: string;
  correctedBy?: string;
}) {
  const { recordId, clockedAt, clockType, note, correctedBy } = input;

  const { data: existing, error: fetchError } = await supabase
    .from("clock_records")
    .select("id, employee_id, assignment_id, clocked_at, clock_type, note, is_manually_corrected, clock_date")
    .eq("id", recordId)
    .single();

  if (fetchError || !existing) {
    return { success: false as const, error: "找不到打卡紀錄" };
  }

  const newClockedAt = new Date(clockedAt);
  if (Number.isNaN(newClockedAt.getTime())) {
    return { success: false as const, error: "打卡時間格式不正確" };
  }

  let assignment: WorkAssignment | null = null;
  if (existing.assignment_id) {
    const { data: assignRow } = await supabase
      .from("shift_assignments")
      .select("id, expected_clock_in, expected_clock_out, shift_types(code, name)")
      .eq("id", existing.assignment_id)
      .maybeSingle();

    if (assignRow) {
      const st = parseShiftJoin(assignRow.shift_types);
      assignment = {
        id: assignRow.id,
        expected_clock_in: String(assignRow.expected_clock_in),
        expected_clock_out: String(assignRow.expected_clock_out),
        shift_code: st?.code ?? "",
        shift_name: st?.name ?? "班別",
      };
    }
  }

  const workDate = String(existing.clock_date);
  const lateEval = evaluateLateForManualCorrection(
    workDate,
    clockType,
    newClockedAt,
    assignment
  );

  const correctionNote = [
    existing.note,
    note?.trim(),
    `【主管修正】${correctedBy?.trim() || "管理員"} 於 ${new Date().toLocaleString("zh-TW", { timeZone: "Asia/Taipei" })} 修改`,
    `原時間：${existing.clocked_at}`,
  ]
    .filter(Boolean)
    .join("；");

  const { data: updated, error: updateError } = await supabase
    .from("clock_records")
    .update({
      clock_type: clockType,
      clocked_at: newClockedAt.toISOString(),
      validation: "manual_override",
      source: "admin_manual",
      is_late: lateEval.isLate,
      late_minutes: lateEval.lateMinutes,
      expected_at: lateEval.expectedAt,
      is_manually_corrected: true,
      corrected_by: correctedBy?.trim() || "管理員",
      corrected_at: new Date().toISOString(),
      original_clocked_at: existing.clocked_at,
      note: correctionNote,
    })
    .eq("id", recordId)
    .select("*")
    .single();

  if (updateError) {
    return { success: false as const, error: updateError.message };
  }

  return { success: true as const, record: updated };
}
