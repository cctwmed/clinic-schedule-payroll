import { NextRequest, NextResponse } from "next/server";
import { bindLineUser } from "@/app/(dashboard)/schedules/actions";

export async function POST(request: NextRequest) {
  const { lineUserId, employeeId, displayName } = await request.json();

  if (!lineUserId || !employeeId) {
    return NextResponse.json({ error: "缺少參數" }, { status: 400 });
  }

  const result = await bindLineUser(employeeId, lineUserId, displayName);
  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}
