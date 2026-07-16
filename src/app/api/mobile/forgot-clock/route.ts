import { NextRequest, NextResponse } from "next/server";
import { getDefaultClinic } from "@/lib/clinic";
import { getShiftDisplayName } from "@/lib/clock/shift-labels";
import { filterWorkAssignments, type WorkAssignment } from "@/lib/clock/session";
import { supabase } from "@/lib/supabase";

async function resolveEmployeeId(lineUserId: string): Promise<string | null> {
  const { data } = await supabase
    .from("employee_line_bindings")
    .select("employee_id")
    .eq("line_user_id", lineUserId)
    .eq("is_active", true)
    .maybeSingle();
  return data?.employee_id ?? null;
}

function parseShiftJoin(raw: unknown): { code: string; name: string } | null {
  if (!raw) return null;
  const item = Array.isArray(raw) ? raw[0] : raw;
  if (!item || typeof item !== "object") return null;
  const s = item as { code?: string; name?: string };
  return { code: s.code ?? "", name: s.name ?? "班別" };
}

function mapAssignments(rows: Record<string, unknown>[]): WorkAssignment[] {
  return rows.map((a) => {
    const st = parseShiftJoin(a.shift_types);
    return {
      id: String(a.id),
      expected_clock_in: String(a.expected_clock_in),
      expected_clock_out: String(a.expected_clock_out),
      shift_code: st?.code ?? "",
      shift_name: st?.name ?? "班別",
    };
  });
}

export async function GET(request: NextRequest) {
  const lineUserId = request.nextUrl.searchParams.get("lineUserId");
  const workDate = request.nextUrl.searchParams.get("workDate");

  if (!lineUserId) {
    return NextResponse.json({ error: "缺少 lineUserId" }, { status: 400 });
  }

  const employeeId = await resolveEmployeeId(lineUserId);
  if (!employeeId) {
    return NextResponse.json({ error: "請先完成身份綁定" }, { status: 400 });
  }

  let pendingCount = 0;
  const { count, error: countErr } = await supabase
    .from("clock_correction_requests")
    .select("id", { count: "exact", head: true })
    .eq("employee_id", employeeId)
    .eq("status", "pending");

  if (!countErr) pendingCount = count ?? 0;

  let sessions: {
    assignmentId: string;
    shiftCode: string;
    shiftName: string;
    label: string;
    expectedClockIn: string;
    expectedClockOut: string;
  }[] = [];

  if (workDate) {
    const { data: rows } = await supabase
      .from("shift_assignments")
      .select("id, expected_clock_in, expected_clock_out, shift_types(code, name)")
      .eq("employee_id", employeeId)
      .eq("work_date", workDate)
      .neq("status", "cancelled")
      .order("expected_clock_in");

    sessions = filterWorkAssignments(mapAssignments(rows ?? [])).map((a) => ({
      assignmentId: a.id,
      shiftCode: a.shift_code,
      shiftName: a.shift_name,
      label: getShiftDisplayName(a.shift_code, a.shift_name),
      expectedClockIn: a.expected_clock_in.slice(0, 5),
      expectedClockOut: a.expected_clock_out.slice(0, 5),
    }));
  }

  return NextResponse.json({ pendingCount, sessions });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { lineUserId, workDate, assignmentId, clockType, requestedTime, reason } = body as {
      lineUserId?: string;
      workDate?: string;
      assignmentId?: string;
      clockType?: "clock_in" | "clock_out";
      requestedTime?: string;
      reason?: string;
    };

    if (!lineUserId || !workDate || !clockType || !requestedTime || !assignmentId) {
      return NextResponse.json({ error: "請填寫日期、診別、類型與時間" }, { status: 400 });
    }

    const employeeId = await resolveEmployeeId(lineUserId);
    if (!employeeId) {
      return NextResponse.json({ error: "請先完成身份綁定" }, { status: 400 });
    }

    const { data: assignRow } = await supabase
      .from("shift_assignments")
      .select("id, shift_types(code, name)")
      .eq("id", assignmentId)
      .eq("employee_id", employeeId)
      .eq("work_date", workDate)
      .maybeSingle();

    if (!assignRow) {
      return NextResponse.json({ error: "所選診別與日期不符，請重新選擇" }, { status: 400 });
    }

    const clinic = await getDefaultClinic();
    const timeValue = requestedTime.length === 5 ? `${requestedTime}:00` : requestedTime;
    const st = parseShiftJoin(assignRow.shift_types);
    const sessionLabel = getShiftDisplayName(st?.code, st?.name);

    const insertPayload: Record<string, unknown> = {
      clinic_id: clinic.id,
      employee_id: employeeId,
      line_user_id: lineUserId,
      work_date: workDate,
      clock_type: clockType,
      requested_time: timeValue,
      assignment_id: assignmentId,
      reason: reason?.trim()
        ? `[${sessionLabel}] ${reason.trim()}`
        : `[${sessionLabel}] 忘記打卡補登`,
      status: "pending",
    };

    let { error } = await supabase.from("clock_correction_requests").insert(insertPayload);

    if (error?.message.includes("assignment_id")) {
      const { assignment_id: _a, ...fallback } = insertPayload;
      ({ error } = await supabase.from("clock_correction_requests").insert(fallback));
    }

    if (error) {
      if (error.message.includes("clock_correction_requests")) {
        return NextResponse.json(
          { error: "系統尚未啟用補登功能，請聯繫管理員執行資料庫 migration" },
          { status: 503 }
        );
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "送出失敗" },
      { status: 500 }
    );
  }
}
