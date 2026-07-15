import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { resolveClinicAdmin } from "@/lib/employee/access";

export async function GET(request: NextRequest) {
  const lineUserId = request.nextUrl.searchParams.get("lineUserId");
  if (!lineUserId) {
    return NextResponse.json({ error: "缺少 lineUserId" }, { status: 400 });
  }

  const { data: binding } = await supabase
    .from("employee_line_bindings")
    .select("employee_id, employees(id, name, role)")
    .eq("line_user_id", lineUserId)
    .eq("is_active", true)
    .maybeSingle();

  if (!binding?.employee_id) {
    return NextResponse.json({ binding: null, isClinicAdmin: false });
  }

  const emp = parseJoin(binding.employees) as {
    name?: string;
    role?: string;
  } | null;

  let isClinicAdmin = resolveClinicAdmin({ ...emp, name: emp?.name });

  if (!isClinicAdmin) {
    const { data: adminFlag } = await supabase
      .from("employees")
      .select("is_clinic_admin")
      .eq("id", binding.employee_id)
      .maybeSingle();
    if (adminFlag?.is_clinic_admin) isClinicAdmin = true;
  }

  return NextResponse.json({
    binding: {
      employeeId: binding.employee_id,
      employeeName: emp?.name ?? "同仁",
    },
    isClinicAdmin,
  });
}

function parseJoin(raw: unknown): unknown {
  if (Array.isArray(raw)) return raw[0] ?? null;
  return raw ?? null;
}
