import { NextRequest, NextResponse } from "next/server";
import { assertMobileAdmin } from "@/lib/employee/liff-admin";
import { getDefaultClinic, taipeiToday } from "@/lib/clinic";
import { supabase } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  try {
    const lineUserId = request.nextUrl.searchParams.get("lineUserId");
  if (!lineUserId) {
    return NextResponse.json({ error: "缺少 lineUserId" }, { status: 400 });
  }
  const admin = await assertMobileAdmin({ lineUserId, request });
  if (!admin.ok) {
    return NextResponse.json({ error: admin.error }, { status: 403 });
  }

  const clinic = await getDefaultClinic();
  const today = request.nextUrl.searchParams.get("date") || taipeiToday();

  const { data, error } = await supabase
    .from("clock_records")
    .select(
      "id, clock_type, clocked_at, is_late, late_minutes, is_early_abnormal, early_minutes, employees!inner(clinic_id, name)"
    )
    .eq("employees.clinic_id", clinic.id)
    .eq("clock_date", today)
    .order("clocked_at", { ascending: false })
    .limit(80);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({
    date: today,
    records: (data ?? []).map((row) => {
      const emp = Array.isArray(row.employees) ? row.employees[0] : row.employees;
      return {
        id: row.id,
        name: (emp as { name?: string } | null)?.name ?? "同仁",
        clockType: row.clock_type,
        clockedAt: row.clocked_at,
        isLate: Boolean(row.is_late),
        lateMinutes: Number(row.late_minutes ?? 0),
        isEarlyAbnormal: Boolean(row.is_early_abnormal),
        earlyMinutes: Number(row.early_minutes ?? 0),
      };
    }),
  });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "載入出勤失敗" },
      { status: 500 }
    );
  }
}
