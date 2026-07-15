import { NextRequest, NextResponse } from "next/server";
import { getDefaultClinic } from "@/lib/clinic";
import { supabase } from "@/lib/supabase";
import {
  createLeaveRequest,
  fetchLeaveRecords,
  syncEmployeeSpecialLeaveBalance,
} from "@/lib/leave/leave-records-service";
import {
  HOURS_PER_LEAVE_DAY,
  LEAVE_TYPE_OPTIONS,
  leaveTypeLabel,
  type LeaveRecordType,
} from "@/lib/leave/leave-types";
import {
  calculateUnusedLeaveDays,
  resolveCurrentLeavePeriod,
  resolveEmployeeArrivalDate,
} from "@/lib/leave/annual-leave";
import { syncEmployeeLeaveRecord } from "@/lib/leave/service";

async function resolveEmployeeId(lineUserId: string): Promise<string | null> {
  const { data } = await supabase
    .from("employee_line_bindings")
    .select("employee_id")
    .eq("line_user_id", lineUserId)
    .eq("is_active", true)
    .maybeSingle();
  return data?.employee_id ?? null;
}

export async function GET(request: NextRequest) {
  const lineUserId = request.nextUrl.searchParams.get("lineUserId");
  if (!lineUserId) {
    return NextResponse.json({ error: "缺少 lineUserId" }, { status: 400 });
  }

  const employeeId = await resolveEmployeeId(lineUserId);
  if (!employeeId) {
    return NextResponse.json({ error: "請先完成身份綁定" }, { status: 400 });
  }

  try {
    const clinic = await getDefaultClinic();
    const { data: emp } = await supabase
      .from("employees")
      .select("name, arrival_date, hire_date, sick_leave_used_this_year, personal_leave_used_this_year")
      .eq("id", employeeId)
      .single();

    const arrival = resolveEmployeeArrivalDate(emp?.arrival_date, emp?.hire_date);
    let remainingDays = 0;
    let totalDays = 0;
    let usedDays = 0;
    let periodLabel = "尚未達特休資格";

    if (arrival) {
      const record = await syncEmployeeLeaveRecord(employeeId, arrival);
      const period = resolveCurrentLeavePeriod(arrival);
      if (record && period) {
        remainingDays = calculateUnusedLeaveDays(record.total_days, record.used_days);
        totalDays = record.total_days;
        usedDays = record.used_days;
        periodLabel = `${period.periodStart} ～ ${period.periodEnd}`;
        await syncEmployeeSpecialLeaveBalance(employeeId, arrival);
      }
    }

    const pending = await fetchLeaveRecords(clinic.id, {
      employeeId,
      status: "pending",
    });

    return NextResponse.json({
      employeeName: emp?.name ?? "同仁",
      remainingDays,
      totalDays,
      usedDays,
      periodLabel,
      sickLeaveUsedDays: Number(emp?.sick_leave_used_this_year ?? 0) / HOURS_PER_LEAVE_DAY,
      personalLeaveUsedDays:
        Number(emp?.personal_leave_used_this_year ?? 0) / HOURS_PER_LEAVE_DAY,
      pendingCount: pending.length,
      leaveTypes: LEAVE_TYPE_OPTIONS.map((t) => ({
        code: t.code,
        label: t.label,
        description: t.description,
      })),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "載入失敗" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { lineUserId, workDate, leaveType, reason } = body as {
      lineUserId?: string;
      workDate?: string;
      leaveType?: LeaveRecordType;
      reason?: string;
    };

    if (!lineUserId || !workDate || !leaveType) {
      return NextResponse.json({ error: "缺少必要參數" }, { status: 400 });
    }

    const employeeId = await resolveEmployeeId(lineUserId);
    if (!employeeId) {
      return NextResponse.json({ error: "請先完成身份綁定" }, { status: 400 });
    }

    const clinic = await getDefaultClinic();
    const result = await createLeaveRequest({
      clinicId: clinic.id,
      employeeId,
      leaveType,
      workDate,
      reason,
      autoApprove: false,
    });

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      message: `${leaveTypeLabel(leaveType)}申請已送出，待管理員核准後納入薪資計算`,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "申請失敗" },
      { status: 500 }
    );
  }
}
