import { NextRequest, NextResponse } from "next/server";
import { resolveLiffAdminAccess } from "@/lib/employee/liff-admin";
import { supabase } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  const lineUserId = request.nextUrl.searchParams.get("lineUserId");
  if (!lineUserId) {
    return NextResponse.json({ error: "缺少 lineUserId" }, { status: 400 });
  }

  const { data: binding } = await supabase
    .from("employee_line_bindings")
    .select("employee_id, employees(id, name, role, employee_no, is_clinic_admin)")
    .eq("line_user_id", lineUserId)
    .eq("is_active", true)
    .maybeSingle();

  if (!binding?.employee_id) {
    return NextResponse.json({ binding: null, isClinicAdmin: false });
  }

  const access = await resolveLiffAdminAccess(lineUserId, binding);

  return NextResponse.json({
    binding: {
      employeeId: binding.employee_id,
      employeeName: access.employeeName ?? "同仁",
      employeeNo: access.employeeNo,
    },
    isClinicAdmin: access.isClinicAdmin,
  });
}
