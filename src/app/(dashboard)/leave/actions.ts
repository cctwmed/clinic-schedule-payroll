"use server";

import { revalidatePath } from "next/cache";
import { getDefaultClinic } from "@/lib/clinic";
import {
  assignAnnualLeaveDay,
  fetchEmployeeLeaveSummaries,
} from "@/lib/leave/service";

export async function fetchLeavePageData() {
  const clinic = await getDefaultClinic();
  const summaries = await fetchEmployeeLeaveSummaries(clinic.id);
  return { clinicName: clinic.name, summaries };
}

export async function requestAnnualLeave(employeeId: string, workDate: string) {
  if (!employeeId || !workDate) {
    return { success: false as const, error: "請選擇員工與日期" };
  }

  try {
    const clinic = await getDefaultClinic();
    const result = await assignAnnualLeaveDay(employeeId, workDate, clinic.id);
    if (!result.success) return result;

    revalidatePath("/leave");
    revalidatePath("/schedules");
    return { success: true as const };
  } catch (err) {
    return {
      success: false as const,
      error: err instanceof Error ? err.message : "登記特休失敗",
    };
  }
}
