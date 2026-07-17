"use server";

import { revalidatePath } from "next/cache";
import { getDefaultClinic } from "@/lib/clinic";
import {
  assignAnnualLeaveDay,
  fetchEmployeeLeaveSummaries,
} from "@/lib/leave/service";
import {
  createLeaveRequest,
  createLeaveRequestRange,
  fetchEmployeeLeaveBalances,
  fetchLeaveRecords,
  listDatesInRange,
  reviewLeaveRecord,
} from "@/lib/leave/leave-records-service";
import type { LeaveRecordType } from "@/lib/leave/leave-types";

export async function fetchLeavePageData(year?: number, month?: number) {
  const clinic = await getDefaultClinic();
  const now = new Date();
  const y = year ?? now.getFullYear();
  const m = month ?? now.getMonth() + 1;

  const [summaries, pending, monthly, balances] = await Promise.all([
    fetchEmployeeLeaveSummaries(clinic.id),
    fetchLeaveRecords(clinic.id, { status: "pending" }),
    fetchLeaveRecords(clinic.id, { year: y, month: m, status: "approved" }),
    fetchEmployeeLeaveBalances(clinic.id),
  ]);

  return {
    clinicName: clinic.name,
    summaries,
    pendingRequests: pending,
    monthlyApproved: monthly,
    balances,
    year: y,
    month: m,
  };
}

export async function submitLeaveRequest(input: {
  employeeId: string;
  workDate?: string;
  startDate?: string;
  endDate?: string;
  leaveType: LeaveRecordType;
  reason?: string;
  autoApprove?: boolean;
}) {
  const rangeStart = input.startDate ?? input.workDate;
  const rangeEnd = input.endDate ?? rangeStart;

  if (!input.employeeId || !rangeStart || !input.leaveType) {
    return { success: false as const, error: "請填寫完整請假資料" };
  }
  if (rangeEnd && rangeEnd < rangeStart) {
    return { success: false as const, error: "結束日不可早於起始日" };
  }

  try {
    const clinic = await getDefaultClinic();
    const useRange = rangeEnd && rangeEnd !== rangeStart;

    const result = useRange
      ? await createLeaveRequestRange({
          clinicId: clinic.id,
          employeeId: input.employeeId,
          leaveType: input.leaveType,
          startDate: rangeStart,
          endDate: rangeEnd,
          reason: input.reason,
          autoApprove: input.autoApprove ?? false,
          reviewedBy: "院長",
        })
      : await createLeaveRequest({
          clinicId: clinic.id,
          employeeId: input.employeeId,
          leaveType: input.leaveType,
          workDate: rangeStart,
          reason: input.reason,
          autoApprove: input.autoApprove ?? false,
          reviewedBy: "院長",
        });

    if (!result.success) return result;

    if (input.leaveType === "special" && input.autoApprove) {
      for (const date of listDatesInRange(rangeStart, rangeEnd ?? rangeStart)) {
        await assignAnnualLeaveDay(input.employeeId, date, clinic.id).catch(() => null);
      }
    }

    revalidatePath("/leave");
    revalidatePath("/schedules");
    revalidatePath("/payroll");
    return { success: true as const };
  } catch (err) {
    return {
      success: false as const,
      error: err instanceof Error ? err.message : "請假申請失敗",
    };
  }
}

/** @deprecated 使用 submitLeaveRequest leaveType=special */
export async function requestAnnualLeave(employeeId: string, workDate: string) {
  return submitLeaveRequest({
    employeeId,
    workDate,
    leaveType: "special",
    autoApprove: true,
  });
}

export async function approveLeaveRequest(input: {
  recordId: string;
  approved: boolean;
  reviewNote?: string;
}) {
  const result = await reviewLeaveRecord({
    recordId: input.recordId,
    approved: input.approved,
    reviewedBy: "院長",
    reviewNote: input.reviewNote,
  });

  if (!result.success) return result;

  if (input.approved) {
    const clinic = await getDefaultClinic();
    const rows = await fetchLeaveRecords(clinic.id);
    const record = rows.find((r) => r.id === input.recordId);
    if (record?.leave_type === "special") {
      await assignAnnualLeaveDay(record.employee_id, record.work_date, clinic.id).catch(
        () => null
      );
    }
  }

  revalidatePath("/leave");
  revalidatePath("/payroll");
  revalidatePath("/schedules");
  return { success: true as const };
}
