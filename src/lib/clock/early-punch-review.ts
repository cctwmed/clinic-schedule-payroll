import { supabase } from "@/lib/supabase";
import { getDefaultClinic } from "@/lib/clinic";

/** 待院長審核的異常提早打卡筆數 */
export async function countPendingEarlyAbnormal(clinicId?: string): Promise<number> {
  const id = clinicId ?? (await getDefaultClinic()).id;

  const { count, error } = await supabase
    .from("clock_records")
    .select("id, employees!inner(clinic_id)", { count: "exact", head: true })
    .eq("employees.clinic_id", id)
    .eq("clock_type", "clock_in")
    .eq("is_early_abnormal", true);

  if (error) {
    if (error.message.includes("is_early_abnormal")) return 0;
    throw new Error(error.message);
  }

  return count ?? 0;
}

export interface EarlyAbnormalRow {
  id: string;
  employee_name: string;
  clocked_at: string;
  early_minutes: number;
}

export async function listPendingEarlyAbnormal(
  clinicId?: string
): Promise<EarlyAbnormalRow[]> {
  const id = clinicId ?? (await getDefaultClinic()).id;
  const { data, error } = await supabase
    .from("clock_records")
    .select("id, clocked_at, early_minutes, employees!inner(clinic_id, name)")
    .eq("employees.clinic_id", id)
    .eq("clock_type", "clock_in")
    .eq("is_early_abnormal", true)
    .order("clocked_at", { ascending: false })
    .limit(50);

  if (error) {
    if (error.message.includes("is_early_abnormal")) return [];
    throw new Error(error.message);
  }

  return (data ?? []).map((row) => {
    const emp = Array.isArray(row.employees) ? row.employees[0] : row.employees;
    return {
      id: String(row.id),
      employee_name: (emp as { name?: string } | null)?.name ?? "同仁",
      clocked_at: String(row.clocked_at),
      early_minutes: Number(row.early_minutes ?? 0),
    };
  });
}

export async function setEarlyWorkApproval(input: {
  recordId: string;
  approved: boolean;
  reviewedBy: string;
}) {
  const { recordId, approved, reviewedBy } = input;

  const { data: existing, error: fetchError } = await supabase
    .from("clock_records")
    .select("id, clock_type, clocked_at, expected_at, note")
    .eq("id", recordId)
    .single();

  if (fetchError || !existing) {
    return { success: false as const, error: "找不到打卡紀錄" };
  }
  if (existing.clock_type !== "clock_in") {
    return { success: false as const, error: "僅上班打卡可審核提早工時" };
  }

  const payableClockedAt = approved
    ? existing.clocked_at
    : existing.expected_at ?? existing.clocked_at;

  const reviewNote = approved
    ? "【院長核可】提早工時計入薪資，起算依實際打卡時間"
    : "【維持對齊】薪資工時自班表時間起算，不計提早時段";

  const { error: updateError } = await supabase
    .from("clock_records")
    .update({
      early_work_approved: approved,
      payable_clocked_at: payableClockedAt,
      is_early_abnormal: false,
      early_reviewed_by: reviewedBy.trim() || "院長",
      early_reviewed_at: new Date().toISOString(),
      note: [existing.note, reviewNote].filter(Boolean).join("；"),
    })
    .eq("id", recordId);

  if (updateError) {
    if (updateError.message.includes("early_work_approved")) {
      return {
        success: false as const,
        error: "資料庫尚未啟用提早打卡欄位，請執行 migration 012",
      };
    }
    return { success: false as const, error: updateError.message };
  }

  return { success: true as const };
}
