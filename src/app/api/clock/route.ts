import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getDefaultClinic, taipeiToday } from "@/lib/clinic";
import { getDistanceMeters, isWithinRadius } from "@/lib/geo/haversine";
import {
  filterWorkAssignments,
  resolveClockInAssignment,
  resolveClockOutAssignment,
  suggestNextClockAction,
  type ClockType,
  type ExistingClock,
  type WorkAssignment,
} from "@/lib/clock/session";

const ALLOWED_RADIUS_M = 100;

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

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      lineUserId,
      employeeId,
      clockType,
      latitude,
      longitude,
      accuracy,
    } = body as {
      lineUserId?: string;
      employeeId?: string;
      clockType?: ClockType;
      latitude?: number;
      longitude?: number;
      accuracy?: number;
    };

    if (!lineUserId || !clockType) {
      return NextResponse.json({ error: "缺少必要參數" }, { status: 400 });
    }

    if (latitude == null || longitude == null) {
      return NextResponse.json({ error: "無法取得 GPS 定位" }, { status: 400 });
    }

    let resolvedEmployeeId = employeeId;

    const { data: binding } = await supabase
      .from("employee_line_bindings")
      .select("employee_id")
      .eq("line_user_id", lineUserId)
      .eq("is_active", true)
      .maybeSingle();

    if (binding) resolvedEmployeeId = binding.employee_id;

    if (!resolvedEmployeeId) {
      return NextResponse.json(
        { error: "尚未綁定員工身份，請先選擇您的姓名完成綁定" },
        { status: 400 }
      );
    }

    const clinic = await getDefaultClinic();
    if (clinic.latitude == null || clinic.longitude == null) {
      return NextResponse.json(
        { error: "診所尚未設定 GPS 座標，請聯繫管理員" },
        { status: 400 }
      );
    }

    const distance = getDistanceMeters(
      latitude,
      longitude,
      clinic.latitude,
      clinic.longitude
    );
    const radius = Math.min(clinic.geo_radius_m, ALLOWED_RADIUS_M);

    if (!isWithinRadius(latitude, longitude, clinic.latitude, clinic.longitude, radius)) {
      return NextResponse.json(
        {
          error: "您目前不在診所範圍內，無法打卡",
          locationValid: false,
          distanceM: Math.round(distance),
          radiusM: radius,
        },
        { status: 403 }
      );
    }

    const today = taipeiToday();
    const clockedAt = new Date();

    const { data: assignmentRows } = await supabase
      .from("shift_assignments")
      .select("id, expected_clock_in, expected_clock_out, shift_types(code, name)")
      .eq("employee_id", resolvedEmployeeId)
      .eq("work_date", today)
      .neq("status", "cancelled")
      .order("expected_clock_in");

    const assignments = mapAssignments(assignmentRows ?? []);
    const workAssignments = filterWorkAssignments(assignments);

    const { data: existingClocks } = await supabase
      .from("clock_records")
      .select("id, assignment_id, clock_type, clocked_at")
      .eq("employee_id", resolvedEmployeeId)
      .eq("clock_date", today)
      .order("clocked_at");

    const clocks = (existingClocks ?? []) as ExistingClock[];

    let match;
    if (clockType === "clock_in") {
      match = resolveClockInAssignment(today, assignments, clocks, clockedAt);
    } else if (clockType === "clock_out") {
      match = resolveClockOutAssignment(assignments, clocks);
    } else {
      match = {
        assignmentId: workAssignments[0]?.id ?? null,
        expectedAt: null,
        isLate: false,
        lateMinutes: 0,
        shiftLabel: null,
      };
    }

    const noteParts: string[] = [];
    if (match.shiftLabel) noteParts.push(`班別：${match.shiftLabel}`);
    if (match.isLate) noteParts.push(`遲到 ${match.lateMinutes} 分鐘`);

    const { data: record, error } = await supabase
      .from("clock_records")
      .insert({
        employee_id: resolvedEmployeeId,
        assignment_id: match.assignmentId,
        clock_type: clockType,
        clocked_at: clockedAt.toISOString(),
        latitude,
        longitude,
        geo_accuracy_m: accuracy ?? null,
        distance_from_clinic_m: Math.round(distance * 100) / 100,
        validation: "valid",
        source: "line_liff",
        is_late: match.isLate,
        late_minutes: match.lateMinutes,
        expected_at: match.expectedAt,
        note: noteParts.length > 0 ? noteParts.join("；") : null,
        device_info: { userAgent: request.headers.get("user-agent") },
      })
      .select(
        "id, clocked_at, validation, distance_from_clinic_m, is_late, late_minutes, clock_type"
      )
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const clockLabels: Record<string, string> = {
      clock_in: "上班",
      clock_out: "下班",
      break_start: "休息開始",
      break_end: "休息結束",
    };

    let message = `${clockLabels[clockType]}打卡成功！`;
    if (match.isLate) {
      message += `（遲到 ${match.lateMinutes} 分鐘，已註記）`;
    }

    return NextResponse.json({
      success: true,
      record,
      message,
      locationValid: true,
      distanceM: Math.round(distance),
      isLate: match.isLate,
      lateMinutes: match.lateMinutes,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "打卡失敗" },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  const lineUserId = request.nextUrl.searchParams.get("lineUserId");
  if (!lineUserId) {
    return NextResponse.json({ error: "缺少 lineUserId" }, { status: 400 });
  }

  const today = taipeiToday();
  const clinic = await getDefaultClinic();

  const { data: binding } = await supabase
    .from("employee_line_bindings")
    .select("employee_id, employees(id, name)")
    .eq("line_user_id", lineUserId)
    .eq("is_active", true)
    .maybeSingle();

  const { data: employees } = await supabase
    .from("employees")
    .select("id, name, employee_no")
    .eq("status", "active")
    .order("employee_no");

  let assignments: WorkAssignment[] = [];
  let todayClocks: ExistingClock[] = [];
  let nextAction: "clock_in" | "clock_out" | "done" = "clock_in";

  if (binding?.employee_id) {
    const { data: assignData } = await supabase
      .from("shift_assignments")
      .select("id, expected_clock_in, expected_clock_out, shift_types(code, name)")
      .eq("employee_id", binding.employee_id)
      .eq("work_date", today)
      .neq("status", "cancelled")
      .order("expected_clock_in");

    assignments = mapAssignments(assignData ?? []);

    const { data: clocks } = await supabase
      .from("clock_records")
      .select(
        "id, clock_type, clocked_at, validation, is_late, late_minutes, is_manually_corrected, assignment_id, note"
      )
      .eq("employee_id", binding.employee_id)
      .eq("clock_date", today)
      .order("clocked_at");

    todayClocks = (clocks ?? []) as ExistingClock[];
    nextAction = suggestNextClockAction(assignments, todayClocks);
  }

  const workToday = filterWorkAssignments(assignments);

  return NextResponse.json({
    clinic: {
      name: clinic.name,
      latitude: clinic.latitude,
      longitude: clinic.longitude,
      radiusM: Math.min(clinic.geo_radius_m, ALLOWED_RADIUS_M),
    },
    binding: binding
      ? {
          employeeId: binding.employee_id,
          employeeName: getEmployeeName(binding.employees),
        }
      : null,
    employees: employees ?? [],
    assignments: workToday,
    todayClocks,
    nextAction,
    today,
  });
}

function getEmployeeName(employees: unknown): string | undefined {
  if (Array.isArray(employees)) {
    return (employees[0] as { name?: string })?.name;
  }
  return (employees as { name?: string } | null)?.name;
}
