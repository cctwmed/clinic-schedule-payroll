import { NextRequest, NextResponse } from "next/server";
import { assertMobileAdmin } from "@/lib/employee/liff-admin";
import { fetchEmployees } from "@/app/(dashboard)/employees/actions";

export async function GET(request: NextRequest) {
  const lineUserId = request.nextUrl.searchParams.get("lineUserId");
  if (!lineUserId) {
    return NextResponse.json({ error: "缺少 lineUserId" }, { status: 400 });
  }
  const admin = await assertMobileAdmin({ lineUserId, request });
  if (!admin.ok) {
    return NextResponse.json({ error: admin.error }, { status: 403 });
  }

  const employees = await fetchEmployees();
  return NextResponse.json({
    employees: employees.map((e) => ({
      id: e.id,
      name: e.name,
      employeeNo: e.employee_no,
      role: e.role,
      status: e.status,
      isClinicAdmin: Boolean(e.is_clinic_admin),
    })),
  });
}
