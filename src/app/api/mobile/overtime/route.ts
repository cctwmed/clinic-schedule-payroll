import { NextRequest, NextResponse } from "next/server";
import { getDefaultClinic } from "@/lib/clinic";
import {
  countPendingOvertime,
  createOvertimeRequest,
} from "@/lib/clock/overtime-request";
import { minutesBetweenHhMm, normalizeHhMm } from "@/lib/time-24";
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

export async function GET(request: NextRequest) {
  const lineUserId = request.nextUrl.searchParams.get("lineUserId");
  if (!lineUserId) {
    return NextResponse.json({ error: "缺少 lineUserId" }, { status: 400 });
  }
  const employeeId = await resolveEmployeeId(lineUserId);
  if (!employeeId) {
    return NextResponse.json({ error: "請先完成身份綁定" }, { status: 400 });
  }
  const pendingCount = await countPendingOvertime(employeeId);
  return NextResponse.json({ pendingCount });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { lineUserId, workDate, startTime, endTime, reason } = body as {
      lineUserId?: string;
      workDate?: string;
      startTime?: string;
      endTime?: string;
      reason?: string;
    };

    if (!lineUserId || !workDate || !startTime || !endTime) {
      return NextResponse.json({ error: "請填寫日期與加班起迄時間" }, { status: 400 });
    }

    const employeeId = await resolveEmployeeId(lineUserId);
    if (!employeeId) {
      return NextResponse.json({ error: "請先完成身份綁定" }, { status: 400 });
    }

    const start = normalizeHhMm(startTime);
    const end = normalizeHhMm(endTime);
    const durationMinutes = minutesBetweenHhMm(start, end);
    if (durationMinutes < 15) {
      return NextResponse.json({ error: "加班時數至少需 15 分鐘" }, { status: 400 });
    }
    if (durationMinutes > 12 * 60) {
      return NextResponse.json({ error: "單次加班申請不可超過 12 小時" }, { status: 400 });
    }

    const clinic = await getDefaultClinic();
    const result = await createOvertimeRequest({
      clinicId: clinic.id,
      employeeId,
      lineUserId,
      workDate,
      startTime: start,
      endTime: end,
      durationMinutes,
      reason,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 503 });
    }

    return NextResponse.json({
      success: true,
      id: result.id,
      durationMinutes,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "送出失敗" },
      { status: 500 }
    );
  }
}
