import { supabase } from "@/lib/supabase";
import {
  evaluateEarlyPunch,
  formatEarlyPunchNote,
} from "@/lib/clock/early-punch";
import {
  evaluateLateForManualCorrection,
  type WorkAssignment,
} from "@/lib/clock/session";

function parseShiftJoin(raw: unknown): { code: string; name: string } | null {
  if (!raw) return null;
  const item = Array.isArray(raw) ? raw[0] : raw;
  if (!item || typeof item !== "object") return null;
  const s = item as { code?: string; name?: string };
  return { code: s.code ?? "", name: s.name ?? "班別" };
}

function toClockedAtIso(workDate: string, time: string): string {
  const t = time.length >= 5 ? time.slice(0, 5) : time;
  return new Date(`${workDate}T${t}:00+08:00`).toISOString();
}

export interface CorrectionRequestRow {
  id: string;
  employee_id: string;
  employee_name: string;
  employee_no: string;
  work_date: string;
  clock_type: string;
  requested_time: string;
  reason: string | null;
  status: string;
  created_at: string;
}

export async function fetchPendingCorrectionRequests(
  clinicId: string
): Promise<CorrectionRequestRow[]> {
  const { data, error } = await supabase
    .from("clock_correction_requests")
    .select(
      `
      id,
      employee_id,
      work_date,
      clock_type,
      requested_time,
      reason,
      status,
      created_at,
      employees(name, employee_no)
    `
    )
    .eq("clinic_id", clinicId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  if (error) {
    if (error.message.includes("clock_correction_requests")) return [];
    throw new Error(error.message);
  }

  return (data ?? []).map((r) => {
    const emp = parseEmployeeJoin(r.employees);
    return {
      id: String(r.id),
      employee_id: String(r.employee_id),
      employee_name: emp?.name ?? "—",
      employee_no: emp?.employee_no ?? "",
      work_date: String(r.work_date),
      clock_type: String(r.clock_type),
      requested_time: String(r.requested_time).slice(0, 5),
      reason: r.reason ? String(r.reason) : null,
      status: String(r.status),
      created_at: String(r.created_at),
    };
  });
}

export async function reviewCorrectionRequest(input: {
  requestId: string;
  approved: boolean;
  reviewedBy: string;
  reviewNote?: string;
}) {
  const { requestId, approved, reviewedBy, reviewNote } = input;

  const { data: req, error: fetchErr } = await supabase
    .from("clock_correction_requests")
    .select("*")
    .eq("id", requestId)
    .single();

  if (fetchErr || !req) {
    return { success: false as const, error: "找不到補登申請" };
  }
  if (req.status !== "pending") {
    return { success: false as const, error: "此申請已處理" };
  }

  if (!approved) {
    const { error } = await supabase
      .from("clock_correction_requests")
      .update({
        status: "rejected",
        reviewed_at: new Date().toISOString(),
        review_note: reviewNote?.trim() || "管理員駁回",
      })
      .eq("id", requestId);

    if (error) return { success: false as const, error: error.message };
    return { success: true as const };
  }

  const clockType = req.clock_type as "clock_in" | "clock_out";
  const clockedAt = toClockedAtIso(String(req.work_date), String(req.requested_time));

  let assignment: WorkAssignment | null = null;

  if (req.assignment_id) {
    const { data: assignById } = await supabase
      .from("shift_assignments")
      .select("id, expected_clock_in, expected_clock_out, shift_types(code, name)")
      .eq("id", req.assignment_id)
      .maybeSingle();
    if (assignById) {
      const st = parseShiftJoin(assignById.shift_types);
      assignment = {
        id: assignById.id,
        expected_clock_in: String(assignById.expected_clock_in),
        expected_clock_out: String(assignById.expected_clock_out),
        shift_code: st?.code ?? "",
        shift_name: st?.name ?? "班別",
      };
    }
  }

  if (!assignment) {
    const { data: assignRow } = await supabase
      .from("shift_assignments")
      .select("id, expected_clock_in, expected_clock_out, shift_types(code, name)")
      .eq("employee_id", req.employee_id)
      .eq("work_date", req.work_date)
      .neq("status", "cancelled")
      .order("expected_clock_in")
      .limit(1)
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

  const newClockedAt = new Date(clockedAt);
  const lateEval = evaluateLateForManualCorrection(
    String(req.work_date),
    clockType,
    newClockedAt,
    assignment
  );
  const expectedAtDate = lateEval.expectedAt ? new Date(lateEval.expectedAt) : null;
  const earlyEval = evaluateEarlyPunch(clockType, newClockedAt, expectedAtDate);
  const earlyNote = formatEarlyPunchNote(earlyEval);

  // 判斷是「忘記補登」還是「打錯時間修正」：查同日、同診別、同類型是否已有打卡。
  // 若已存在 → 就地覆蓋該筆（修正），避免同一診別出現兩筆打卡；否則新增（補登）。
  let existingRecord: { id: string; clocked_at: string } | null = null;
  {
    let query = supabase
      .from("clock_records")
      .select("id, clocked_at")
      .eq("employee_id", req.employee_id)
      .eq("clock_type", clockType)
      .eq("clock_date", req.work_date);
    if (assignment?.id) {
      query = query.eq("assignment_id", assignment.id);
    }
    const { data: rows } = await query
      .order("clocked_at", { ascending: true })
      .limit(1);
    if (rows && rows.length > 0) {
      existingRecord = {
        id: String(rows[0].id),
        clocked_at: String(rows[0].clocked_at),
      };
    }
  }

  const note = [
    req.reason,
    earlyNote,
    existingRecord
      ? `【修正核准】${reviewedBy.trim() || "管理員"} 審核通過；原時間 ${existingRecord.clocked_at}`
      : `【補登核准】${reviewedBy.trim() || "管理員"} 審核通過`,
  ]
    .filter(Boolean)
    .join("；");

  const computed: Record<string, unknown> = {
    clock_type: clockType,
    clocked_at: clockedAt,
    validation: "manual_override",
    source: "admin_manual",
    is_late: lateEval.isLate,
    late_minutes: lateEval.lateMinutes,
    expected_at: lateEval.expectedAt,
    is_early: earlyEval.isEarly,
    early_minutes: earlyEval.earlyMinutes,
    payable_clocked_at: earlyEval.payableClockedAt,
    is_early_abnormal: earlyEval.isEarlyAbnormal,
    early_work_approved: false,
    is_manually_corrected: true,
    corrected_by: reviewedBy.trim() || "管理員",
    corrected_at: new Date().toISOString(),
    note,
  };

  const EARLY_KEYS = [
    "is_early",
    "early_minutes",
    "payable_clocked_at",
    "is_early_abnormal",
    "early_work_approved",
  ];
  const stripEarly = (payload: Record<string, unknown>) => {
    const clone = { ...payload };
    for (const key of EARLY_KEYS) delete clone[key];
    return clone;
  };

  let writeErr: { message: string } | null = null;

  if (existingRecord) {
    const updatePayload: Record<string, unknown> = {
      ...computed,
      original_clocked_at: existingRecord.clocked_at,
    };
    let { error } = await supabase
      .from("clock_records")
      .update(updatePayload)
      .eq("id", existingRecord.id);
    if (
      error?.message.includes("is_early") ||
      error?.message.includes("early_minutes") ||
      error?.message.includes("original_clocked_at")
    ) {
      const fallback = stripEarly(updatePayload);
      delete fallback.original_clocked_at;
      ({ error } = await supabase
        .from("clock_records")
        .update(fallback)
        .eq("id", existingRecord.id));
    }
    writeErr = error;
  } else {
    const insertPayload: Record<string, unknown> = {
      ...computed,
      employee_id: req.employee_id,
      assignment_id: assignment?.id ?? req.assignment_id ?? null,
    };
    let { error } = await supabase.from("clock_records").insert(insertPayload);
    if (
      error?.message.includes("is_early") ||
      error?.message.includes("early_minutes")
    ) {
      ({ error } = await supabase
        .from("clock_records")
        .insert(stripEarly(insertPayload)));
    }
    writeErr = error;
  }

  if (writeErr) {
    return { success: false as const, error: writeErr.message };
  }

  const { error: updErr } = await supabase
    .from("clock_correction_requests")
    .update({
      status: "approved",
      reviewed_at: new Date().toISOString(),
      review_note:
        reviewNote?.trim() ||
        (existingRecord ? "已修正打卡紀錄" : "已補登至打卡紀錄"),
    })
    .eq("id", requestId);

  if (updErr) return { success: false as const, error: updErr.message };
  return { success: true as const };
}

function parseEmployeeJoin(raw: unknown): { name?: string; employee_no?: string } | null {
  if (!raw) return null;
  const item = Array.isArray(raw) ? raw[0] : raw;
  return item as { name?: string; employee_no?: string };
}
