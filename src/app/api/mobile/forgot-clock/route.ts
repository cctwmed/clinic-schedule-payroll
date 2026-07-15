import { NextRequest, NextResponse } from "next/server";
import { getDefaultClinic } from "@/lib/clinic";
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

  const { count, error } = await supabase
    .from("clock_correction_requests")
    .select("id", { count: "exact", head: true })
    .eq("employee_id", employeeId)
    .eq("status", "pending");

  if (error) {
    if (error.message.includes("clock_correction_requests")) {
      return NextResponse.json({ pendingCount: 0 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ pendingCount: count ?? 0 });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { lineUserId, workDate, clockType, requestedTime, reason } = body as {
      lineUserId?: string;
      workDate?: string;
      clockType?: "clock_in" | "clock_out";
      requestedTime?: string;
      reason?: string;
    };

    if (!lineUserId || !workDate || !clockType || !requestedTime) {
      return NextResponse.json({ error: "請填寫日期、類型與時間" }, { status: 400 });
    }

    const employeeId = await resolveEmployeeId(lineUserId);
    if (!employeeId) {
      return NextResponse.json({ error: "請先完成身份綁定" }, { status: 400 });
    }

    const clinic = await getDefaultClinic();
    const timeValue = requestedTime.length === 5 ? `${requestedTime}:00` : requestedTime;

    const { error } = await supabase.from("clock_correction_requests").insert({
      clinic_id: clinic.id,
      employee_id: employeeId,
      line_user_id: lineUserId,
      work_date: workDate,
      clock_type: clockType,
      requested_time: timeValue,
      reason: reason?.trim() || null,
      status: "pending",
    });

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
