import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getDefaultClinic } from "@/lib/clinic";
import { fetchMobilePayslip } from "@/lib/mobile/employee-portal";

export async function GET(request: NextRequest) {
  const lineUserId = request.nextUrl.searchParams.get("lineUserId");
  const year = Number(request.nextUrl.searchParams.get("year"));
  const month = Number(request.nextUrl.searchParams.get("month"));

  if (!lineUserId) {
    return NextResponse.json({ error: "缺少 lineUserId" }, { status: 400 });
  }

  const now = new Date();
  const y = year || now.getFullYear();
  const m = month || now.getMonth() + 1;

  const { data: binding } = await supabase
    .from("employee_line_bindings")
    .select("employee_id")
    .eq("line_user_id", lineUserId)
    .eq("is_active", true)
    .maybeSingle();

  if (!binding) {
    return NextResponse.json({ error: "尚未綁定員工身份" }, { status: 400 });
  }

  try {
    const clinic = await getDefaultClinic();
    const data = await fetchMobilePayslip(binding.employee_id, clinic.id, y, m);
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "載入薪資失敗" },
      { status: 500 }
    );
  }
}
