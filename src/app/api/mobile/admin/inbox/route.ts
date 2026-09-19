import { NextRequest, NextResponse } from "next/server";
import { getDefaultClinic } from "@/lib/clinic";
import { assertMobileAdmin } from "@/lib/employee/liff-admin";
import { fetchLeaveRecords, reviewLeaveRecord } from "@/lib/leave/leave-records-service";
import { assignAnnualLeaveDay } from "@/lib/leave/service";
import {
  fetchPendingCorrectionRequests,
  reviewCorrectionRequest,
} from "@/lib/clock/correction-request";
import {
  listPendingOvertimeRequests,
  reviewOvertimeRequest,
} from "@/lib/clock/overtime-request";
import {
  listPendingEarlyAbnormal,
  setEarlyWorkApproval,
} from "@/lib/clock/early-punch-review";

async function requireAdmin(request: NextRequest, lineUserId: string, token?: string | null) {
  return assertMobileAdmin({ lineUserId, request, token });
}

export async function GET(request: NextRequest) {
  const lineUserId = request.nextUrl.searchParams.get("lineUserId");
  if (!lineUserId) {
    return NextResponse.json({ error: "缺少 lineUserId" }, { status: 400 });
  }

  const admin = await requireAdmin(request, lineUserId);
  if (!admin.ok) {
    return NextResponse.json({ error: admin.error }, { status: 403 });
  }

  const clinic = await getDefaultClinic();
  const [leaves, corrections, overtime, early] = await Promise.all([
    fetchLeaveRecords(clinic.id, { status: "pending" }),
    fetchPendingCorrectionRequests(clinic.id),
    listPendingOvertimeRequests(clinic.id),
    listPendingEarlyAbnormal(clinic.id),
  ]);

  return NextResponse.json({
    leaves: leaves.map((r) => ({
      id: r.id,
      employeeName: r.employee_name,
      workDate: r.work_date,
      leaveType: r.leave_type,
      hours: r.total_hours,
      reason: r.reason,
    })),
    corrections,
    overtime,
    early,
  });
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as {
    lineUserId?: string;
    kind?: "leave" | "correction" | "overtime" | "early";
    id?: string;
    approved?: boolean;
    token?: string;
  };

  const lineUserId = body.lineUserId?.trim();
  const kind = body.kind;
  const id = body.id?.trim();
  const approved = Boolean(body.approved);

  if (!lineUserId || !kind || !id) {
    return NextResponse.json({ error: "缺少審核參數" }, { status: 400 });
  }

  const admin = await requireAdmin(request, lineUserId, body.token);
  if (!admin.ok) {
    return NextResponse.json({ error: admin.error }, { status: 403 });
  }

  if (kind === "leave") {
    const result = await reviewLeaveRecord({
      recordId: id,
      approved,
      reviewedBy: admin.reviewer,
    });
    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    if (approved) {
      const clinic = await getDefaultClinic();
      const rows = await fetchLeaveRecords(clinic.id);
      const record = rows.find((r) => r.id === id);
      if (record?.leave_type === "special") {
        await assignAnnualLeaveDay(record.employee_id, record.work_date, clinic.id).catch(
          () => null
        );
      }
    }
    return NextResponse.json({
      success: true,
      message: approved ? "已核准請假" : "已駁回請假",
    });
  }

  if (kind === "correction") {
    const result = await reviewCorrectionRequest({
      requestId: id,
      approved,
      reviewedBy: admin.reviewer,
    });
    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({
      success: true,
      message: approved ? "已核准補登／修正打卡" : "已駁回申請",
    });
  }

  if (kind === "overtime") {
    const result = await reviewOvertimeRequest(id, approved ? "approved" : "rejected");
    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({
      success: true,
      message: approved ? "已核准加班" : "已駁回加班",
    });
  }

  if (kind === "early") {
    const result = await setEarlyWorkApproval({
      recordId: id,
      approved,
      reviewedBy: admin.reviewer,
    });
    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({
      success: true,
      message: approved ? "已核可提早工時" : "已維持對齊班表",
    });
  }

  return NextResponse.json({ error: "未知審核類型" }, { status: 400 });
}
