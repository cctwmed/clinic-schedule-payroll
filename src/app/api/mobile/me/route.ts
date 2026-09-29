import { NextRequest, NextResponse } from "next/server";
import { assertMobileAdmin, stampKnownClinicAdmins } from "@/lib/employee/liff-admin";

export async function GET(request: NextRequest) {
  try {
    const lineUserId = request.nextUrl.searchParams.get("lineUserId");
    if (!lineUserId) {
      return NextResponse.json({ error: "缺少 lineUserId" }, { status: 400 });
    }

    await stampKnownClinicAdmins().catch(() => undefined);
    const admin = await assertMobileAdmin({ lineUserId, request });
    if (!admin.ok) {
      return NextResponse.json({
        binding: null,
        isClinicAdmin: false,
        adminHint: admin.error,
      });
    }

    return NextResponse.json({
      binding: {
        employeeName: admin.reviewer,
      },
      isClinicAdmin: true,
    });
  } catch (err) {
    return NextResponse.json(
      {
        binding: null,
        isClinicAdmin: false,
        adminHint: err instanceof Error ? err.message : "無法確認管理員權限",
      },
      { status: 200 }
    );
  }
}
