import { NextRequest, NextResponse } from "next/server";
import { assertMobileAdmin } from "@/lib/employee/liff-admin";
import {
  fetchSchedulePageData,
  saveScheduleAssignment,
  applySessionPattern,
  updateStaffingPerSession,
} from "@/app/(dashboard)/schedules/actions";
import type { ClinicSessionPattern } from "@/lib/schedules/golden-config";

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

    const now = new Date();
    const year = Number(request.nextUrl.searchParams.get("year")) || now.getFullYear();
    const month = Number(request.nextUrl.searchParams.get("month")) || now.getMonth() + 1;
    const data = await fetchSchedulePageData(year, month);

    return NextResponse.json({
      year,
      month,
      scheduleId: data.schedule.id,
      sessionPattern: data.sessionPattern,
      staffingPerSession: data.staffingPerSession,
      daysInMonth: data.daysInMonth,
      employees: data.employees.map((e) => ({ id: e.id, name: e.name })),
      shifts: data.shiftTypes
        .filter((s) => data.sessionPattern === "three" || s.code !== "AFTERNOON")
        .map((s) => ({
          id: s.id,
          code: s.code,
          name: s.name,
          clockIn: s.default_clock_in,
          clockOut: s.default_clock_out,
        })),
      assignmentMap: data.assignmentMap,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "載入排班失敗" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
    lineUserId?: string;
    token?: string;
    kind?: "assign" | "pattern" | "staffing";
    scheduleId?: string;
    workDate?: string;
    shiftTypeId?: string;
    employeeIds?: string[];
    clockIn?: string;
    clockOut?: string;
    pattern?: ClinicSessionPattern;
    staffingPerSession?: number;
  };

  const lineUserId = body.lineUserId?.trim();
  if (!lineUserId) {
    return NextResponse.json({ error: "缺少 lineUserId" }, { status: 400 });
  }
  const admin = await assertMobileAdmin({
    lineUserId,
    request,
    token: body.token,
  });
  if (!admin.ok) {
    return NextResponse.json({ error: admin.error }, { status: 403 });
  }

  if (body.kind === "pattern" && body.scheduleId && body.pattern) {
    const result = await applySessionPattern(body.scheduleId, body.pattern);
    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({ success: true, message: "開診結構已更新" });
  }

  if (body.kind === "staffing" && body.scheduleId && body.staffingPerSession) {
    const result = await updateStaffingPerSession(body.scheduleId, body.staffingPerSession);
    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({
      success: true,
      message: `一診可排 ${result.staffingPerSession} 人`,
    });
  }

  if (
    !body.scheduleId ||
    !body.workDate ||
    !body.shiftTypeId ||
    !body.clockIn ||
    !body.clockOut
  ) {
    return NextResponse.json({ error: "缺少排班參數" }, { status: 400 });
  }

  const result = await saveScheduleAssignment(
    body.scheduleId,
    body.workDate,
    body.shiftTypeId,
    body.employeeIds ?? [],
    body.clockIn,
    body.clockOut
  );
  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ success: true, message: "已儲存排班" });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "儲存失敗" },
      { status: 500 }
    );
  }
}
