import { NextRequest, NextResponse } from "next/server";
import { assertMobileAdmin } from "@/lib/employee/liff-admin";
import { fetchPayrollPageData } from "@/app/(dashboard)/payroll/actions";

export async function GET(request: NextRequest) {
  const lineUserId = request.nextUrl.searchParams.get("lineUserId");
  if (!lineUserId) {
    return NextResponse.json({ error: "缺少 lineUserId" }, { status: 400 });
  }
  const admin = await assertMobileAdmin({ lineUserId, request });
  if (!admin.ok) {
    return NextResponse.json({ error: admin.error }, { status: 403 });
  }

  const now = new Date();
  const year = Number(request.nextUrl.searchParams.get("year")) || now.getFullYear();
  const month = Number(request.nextUrl.searchParams.get("month")) || now.getMonth() + 1;
  const data = await fetchPayrollPageData(year, month);

  return NextResponse.json({
    year,
    month,
    items: data.lineItems.map((item) => ({
      id: item.employeeId,
      name: item.employeeName,
      netPay: item.netPay,
      basePay: item.monthlyBaseSalary,
    })),
  });
}
