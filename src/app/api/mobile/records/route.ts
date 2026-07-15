import { NextRequest, NextResponse } from "next/server";
import { taipeiToday } from "@/lib/clinic";
import { supabase } from "@/lib/supabase";

const TYPE_LABELS: Record<string, string> = {
  clock_in: "上班",
  clock_out: "下班",
  break_start: "休息開始",
  break_end: "休息結束",
};

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

export async function GET(request: NextRequest) {
  const lineUserId = request.nextUrl.searchParams.get("lineUserId");
  if (!lineUserId) {
    return NextResponse.json({ error: "缺少 lineUserId" }, { status: 400 });
  }

  const { data: binding } = await supabase
    .from("employee_line_bindings")
    .select("employee_id")
    .eq("line_user_id", lineUserId)
    .eq("is_active", true)
    .maybeSingle();

  if (!binding?.employee_id) {
    return NextResponse.json({ error: "請先完成身份綁定" }, { status: 400 });
  }

  const today = taipeiToday();
  const from = addDaysTaipei(today, -14);

  const { data, error } = await supabase
    .from("clock_records")
    .select("id, clock_type, clocked_at, is_late, late_minutes, is_manually_corrected")
    .eq("employee_id", binding.employee_id)
    .gte("clock_date", from)
    .lte("clock_date", today)
    .order("clocked_at", { ascending: false })
    .limit(40);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const records = (data ?? []).map((r) => ({
    id: r.id,
    clockType: r.clock_type,
    clockTypeLabel: TYPE_LABELS[r.clock_type] ?? r.clock_type,
    clockedAt: r.clocked_at,
    isLate: !!r.is_late,
    lateMinutes: Number(r.late_minutes ?? 0),
    isManuallyCorrected: !!r.is_manually_corrected,
  }));

  return NextResponse.json({ records });
}
