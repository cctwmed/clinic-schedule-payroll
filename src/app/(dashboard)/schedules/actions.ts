"use server";

import { revalidatePath } from "next/cache";
import { supabase } from "@/lib/supabase";
import { ensureShiftTypes, getDefaultClinic, getDefaultClinicId } from "@/lib/clinic";
import { pushLineMessage, buildSchedulePublishedMessage } from "@/lib/line/client";
import type {
  DayAssignmentMap,
  Schedule,
  ScheduleEmployee,
  ShiftAssignment,
  ShiftType,
} from "@/types/schedule";
import {
  ASSIGNABLE_CATEGORIES,
  cellStaffIds,
  formatWorkDate,
  getDaysInMonth,
  OFF_DAY_CATEGORIES,
} from "@/types/schedule";
import { checkCompliance, complianceIssueOverlapsRange } from "@/lib/compliance/check-compliance";
import { compliancePeriod, loadComplianceData, monthPeriod } from "@/lib/compliance/load-compliance-data";
import type { ComplianceIssue } from "@/lib/compliance/types";
import { buildGoldenShiftSlots, getShiftTemplate } from "@/lib/shift-templates";
import {
  parseGoldenConfig,
  parseScheduleMeta,
  mergeScheduleMeta,
  normalizeClosureReason,
  flattenAssignmentSnapshot,
  normalizeSessionPattern,
  clampStaffingPerSession,
  readSessionPattern,
  readStaffingPerSession,
  type GoldenScheduleConfig,
  type ClosureRecord,
  type ClosureReason,
  type ClinicSessionPattern,
  type SessionTimesConfig,
} from "@/lib/schedules/golden-config";
import { generateGoldenMonthSchedule } from "@/lib/schedules/golden-rotation";
import { validateSameDayAssignment } from "@/lib/schedules/assignment-validation";
import {
  CHILD_LABOR_NIGHT_SHIFT_ERROR,
  resolveAgeCompliance,
  shiftViolatesChildLaborNightHours,
} from "@/lib/employee/age-compliance";
import { listTaiwanPublicHolidaysInRange } from "@/lib/holidays/taiwan-public-holidays";

export async function fetchSchedulePageData(year: number, month: number) {
  const clinic = await getDefaultClinic();
  await ensureShiftTypes(clinic.id);

  const { start: monthStart, end: monthEnd } = monthPeriod(year, month);

  const [shiftTypesResult, employeesResult, schedule] = await Promise.all([
    supabase
      .from("shift_types")
      .select("*")
      .eq("clinic_id", clinic.id)
      .eq("is_active", true)
      .in("category", [...ASSIGNABLE_CATEGORIES, ...OFF_DAY_CATEGORIES])
      .order("sort_order"),
    supabase
      .from("employees")
      .select("id, name, employee_no, job_title, birth_date, is_child_laborer")
      .eq("clinic_id", clinic.id)
      .eq("status", "active")
      .order("employee_no"),
    getOrCreateSchedule(clinic.id, year, month),
  ]);

  if (shiftTypesResult.error) throw new Error(shiftTypesResult.error.message);
  if (employeesResult.error) throw new Error(employeesResult.error.message);

  const shiftTypes = shiftTypesResult.data;
  const employees = employeesResult.data;

  const { data: assignments, error: assignError } = await supabase
    .from("shift_assignments")
    .select("*")
    .eq("schedule_id", schedule.id);

  if (assignError) throw new Error(assignError.message);

  const assignmentMap = buildAssignmentMap(assignments ?? []);
  const goldenConfig = parseGoldenConfig(schedule.note);
  const scheduleMeta = parseScheduleMeta(schedule.note);
  const afternoonId =
    ((shiftTypes ?? []) as ShiftType[]).find((s) => s.code === "AFTERNOON")?.id ?? "";
  const hasAfternoonStaff = afternoonId
    ? Object.values(assignmentMap).some(
        (day) => cellStaffIds(day[afternoonId]).length > 0
      )
    : false;
  const sessionPattern = hasAfternoonStaff
    ? "three"
    : readSessionPattern(scheduleMeta);
  const staffingPerSession = readStaffingPerSession(scheduleMeta);

  const workShiftTypes = ((shiftTypes ?? []) as ShiftType[]).filter((s) =>
    ASSIGNABLE_CATEGORIES.includes(s.category)
  );
  const offDayShiftTypes = ((shiftTypes ?? []) as ShiftType[]).filter(
    (s) =>
      OFF_DAY_CATEGORIES.includes(s.category) ||
      s.code === "STATUTORY" ||
      s.code === "REST" ||
      s.code === "ANNUAL_LEAVE" ||
      s.code === "CLOSED"
  );

  // 合規檢查改由客戶端非同步載入，避免切換月份時整頁卡住
  const publicHolidays = listTaiwanPublicHolidaysInRange(monthStart, monthEnd);

  return {
    clinic,
    schedule,
    shiftTypes: workShiftTypes,
    offDayShiftTypes,
    employees: (employees ?? []) as ScheduleEmployee[],
    assignmentMap,
    daysInMonth: getDaysInMonth(year, month),
    complianceIssues: [] as ComplianceIssue[],
    goldenConfig,
    sessionPattern,
    staffingPerSession,
    sessionTimes: scheduleMeta.sessionTimes ?? goldenConfig?.sessionTimes ?? null,
    closures: scheduleMeta.closures ?? [],
    publicHolidays,
    publishedSnapshot: scheduleMeta.publishedSnapshot ?? null,
  };
}

/** 非同步載入當月合規警示（不擋班表主畫面） */
export async function fetchScheduleComplianceIssues(
  year: number,
  month: number
): Promise<ComplianceIssue[]> {
  const clinic = await getDefaultClinic();
  const { start: monthStart, end: monthEnd } = monthPeriod(year, month);
  const compPeriod = compliancePeriod(year, month);

  const [{ data: employees }, schedule] = await Promise.all([
    supabase
      .from("employees")
      .select("id, name")
      .eq("clinic_id", clinic.id)
      .eq("status", "active"),
    getOrCreateSchedule(clinic.id, year, month),
  ]);

  const goldenConfig = parseGoldenConfig(schedule.note);
  const complianceData = await loadComplianceData(clinic.id, compPeriod.start, compPeriod.end);

  return checkCompliance({
    periodStart: compPeriod.start,
    periodEnd: compPeriod.end,
    shifts: complianceData.shifts,
    dayOffs: complianceData.dayOffs,
    clocks: complianceData.clocks,
    employeeIds: (employees ?? []).map((e) => ({ id: e.id, name: e.name })),
    employeeAId: goldenConfig?.employeeAId,
    oddWeekTrackForA: goldenConfig?.oddWeekTrackForA ?? 1,
  }).filter((i) => complianceIssueOverlapsRange(i, monthStart, monthEnd));
}

async function getOrCreateSchedule(
  clinicId: string,
  year: number,
  month: number
): Promise<Schedule> {
  const { data: existing, error } = await supabase
    .from("schedules")
    .select("*")
    .eq("clinic_id", clinicId)
    .eq("year", year)
    .eq("month", month)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (existing) return existing as Schedule;

  const { data: created, error: createError } = await supabase
    .from("schedules")
    .insert({ clinic_id: clinicId, year, month, status: "draft" })
    .select("*")
    .single();

  if (createError) throw new Error(createError.message);
  return created as Schedule;
}

function buildAssignmentMap(assignments: ShiftAssignment[]): DayAssignmentMap {
  const map: DayAssignmentMap = {};
  for (const a of assignments) {
    if (!map[a.work_date]) map[a.work_date] = {};
    const current = map[a.work_date][a.shift_type_id] ?? [];
    if (!current.includes(a.employee_id)) {
      map[a.work_date][a.shift_type_id] = [...current, a.employee_id];
    }
  }
  return map;
}

async function validateAssignmentConflict(
  scheduleId: string,
  workDate: string,
  shiftTypeId: string,
  employeeId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: targetShift, error: targetError } = await supabase
    .from("shift_types")
    .select("code, category")
    .eq("id", shiftTypeId)
    .single();

  if (targetError || !targetShift) {
    return { ok: false, error: targetError?.message ?? "找不到班別" };
  }

  const { data: existingRows, error: existingError } = await supabase
    .from("shift_assignments")
    .select("shift_type_id, shift_types(code, category)")
    .eq("schedule_id", scheduleId)
    .eq("work_date", workDate)
    .eq("employee_id", employeeId);

  if (existingError) return { ok: false, error: existingError.message };

  const existingCodes = (existingRows ?? [])
    .filter((row) => row.shift_type_id !== shiftTypeId)
    .map((row) => {
      const st = row.shift_types as { code?: string } | { code?: string }[] | null;
      const item = Array.isArray(st) ? st[0] : st;
      return item?.code ?? "";
    })
    .filter(Boolean);

  return validateSameDayAssignment(
    { code: targetShift.code, category: targetShift.category },
    existingCodes
  );
}

async function validateChildLaborNightShift(
  employeeId: string,
  expectedClockIn: string,
  expectedClockOut: string,
  shiftCode: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (shiftCode === "STATUTORY" || shiftCode === "REST" || shiftCode === "ANNUAL_LEAVE" || shiftCode === "CLOSED") {
    return { ok: true };
  }

  const { data: emp, error } = await supabase
    .from("employees")
    .select("birth_date, national_id, is_child_laborer")
    .eq("id", employeeId)
    .maybeSingle();

  if (error || !emp) return { ok: true };

  const isChild =
    emp.is_child_laborer ||
    resolveAgeCompliance(emp.birth_date, emp.national_id).isChildLaborer;

  if (!isChild) return { ok: true };

  if (shiftViolatesChildLaborNightHours(expectedClockIn, expectedClockOut)) {
    return { ok: false, error: CHILD_LABOR_NIGHT_SHIFT_ERROR };
  }

  return { ok: true };
}

export async function saveScheduleAssignment(
  scheduleId: string,
  workDate: string,
  shiftTypeId: string,
  employeeId: string | string[] | null,
  expectedClockIn: string,
  expectedClockOut: string
) {
  const { data: schedule, error: scheduleError } = await supabase
    .from("schedules")
    .select("status")
    .eq("id", scheduleId)
    .single();

  if (scheduleError) return { success: false as const, error: scheduleError.message };

  if (schedule.status === "published") {
    const snapResult = await ensurePublishedSnapshot(scheduleId);
    if (!snapResult.ok) return { success: false as const, error: snapResult.error };
  }

  const desired = cellStaffIds(employeeId);

  const { data: existingRows, error: existingError } = await supabase
    .from("shift_assignments")
    .select("id, employee_id")
    .eq("schedule_id", scheduleId)
    .eq("work_date", workDate)
    .eq("shift_type_id", shiftTypeId);

  if (existingError) return { success: false as const, error: existingError.message };

  const existing = existingRows ?? [];
  const existingIds = existing.map((row) => row.employee_id);

  if (desired.length === 0) {
    const { error } = await supabase
      .from("shift_assignments")
      .delete()
      .eq("schedule_id", scheduleId)
      .eq("work_date", workDate)
      .eq("shift_type_id", shiftTypeId);

    if (error) return { success: false as const, error: error.message };
    return { success: true as const };
  }

  const toRemove = existing.filter((row) => !desired.includes(row.employee_id));
  const toAdd = desired.filter((id) => !existingIds.includes(id));

  const { data: shiftMeta } = await supabase
    .from("shift_types")
    .select("code")
    .eq("id", shiftTypeId)
    .maybeSingle();

  for (const addId of toAdd) {
    const conflict = await validateAssignmentConflict(
      scheduleId,
      workDate,
      shiftTypeId,
      addId
    );
    if (!conflict.ok) {
      return { success: false as const, error: conflict.error };
    }

    const childCheck = await validateChildLaborNightShift(
      addId,
      expectedClockIn,
      expectedClockOut,
      shiftMeta?.code ?? ""
    );
    if (!childCheck.ok) {
      return { success: false as const, error: childCheck.error };
    }
  }

  if (toRemove.length > 0) {
    const { error } = await supabase
      .from("shift_assignments")
      .delete()
      .in(
        "id",
        toRemove.map((row) => row.id)
      );
    if (error) return { success: false as const, error: error.message };
  }

  const keepIds = existing
    .filter((row) => desired.includes(row.employee_id))
    .map((row) => row.id);
  if (keepIds.length > 0) {
    const { error } = await supabase
      .from("shift_assignments")
      .update({
        expected_clock_in: expectedClockIn,
        expected_clock_out: expectedClockOut,
      })
      .in("id", keepIds);
    if (error) return { success: false as const, error: error.message };
  }

  if (toAdd.length > 0) {
    const { error } = await supabase.from("shift_assignments").insert(
      toAdd.map((id) => ({
        schedule_id: scheduleId,
        employee_id: id,
        shift_type_id: shiftTypeId,
        work_date: workDate,
        expected_clock_in: expectedClockIn,
        expected_clock_out: expectedClockOut,
        status: "scheduled" as const,
      }))
    );
    if (error) return { success: false as const, error: error.message };
  }

  return { success: true as const };
}

export async function applySessionPattern(
  scheduleId: string,
  pattern: ClinicSessionPattern
) {
  const next = normalizeSessionPattern(pattern);
  const { data: schedule, error: scheduleError } = await supabase
    .from("schedules")
    .select("id, clinic_id, status, note")
    .eq("id", scheduleId)
    .single();

  if (scheduleError || !schedule) {
    return { success: false as const, error: scheduleError?.message ?? "找不到班表" };
  }

  if (schedule.status === "published") {
    const snapResult = await ensurePublishedSnapshot(scheduleId);
    if (!snapResult.ok) return { success: false as const, error: snapResult.error };
  }

  if (next === "three") {
    const { data: afternoonType } = await supabase
      .from("shift_types")
      .select("id")
      .eq("clinic_id", schedule.clinic_id)
      .eq("code", "AFTERNOON")
      .maybeSingle();
    if (!afternoonType?.id) {
      await applyClinicGoldenTemplate({ skipRevalidate: true });
    }
  }

  if (next === "two") {
    const { data: afternoonType } = await supabase
      .from("shift_types")
      .select("id")
      .eq("clinic_id", schedule.clinic_id)
      .eq("code", "AFTERNOON")
      .maybeSingle();

    if (afternoonType?.id) {
      const { error } = await supabase
        .from("shift_assignments")
        .delete()
        .eq("schedule_id", scheduleId)
        .eq("shift_type_id", afternoonType.id);
      if (error) return { success: false as const, error: error.message };
    }
  }

  const currentGolden = parseGoldenConfig(schedule.note);
  const patch: Parameters<typeof mergeScheduleMeta>[1] = { sessionPattern: next };
  if (currentGolden) {
    patch.golden = { ...currentGolden, sessionPattern: next };
  }
  const { error: updateError } = await supabase
    .from("schedules")
    .update({
      note: mergeScheduleMeta(schedule.note, patch),
    })
    .eq("id", scheduleId);

  if (updateError) return { success: false as const, error: updateError.message };
  revalidatePath("/schedules");
  return { success: true as const, sessionPattern: next };
}

export async function updateStaffingPerSession(
  scheduleId: string,
  staffingPerSession: number
) {
  const staffing = clampStaffingPerSession(staffingPerSession);
  const { data: schedule, error: scheduleError } = await supabase
    .from("schedules")
    .select("id, note")
    .eq("id", scheduleId)
    .single();

  if (scheduleError || !schedule) {
    return { success: false as const, error: scheduleError?.message ?? "找不到班表" };
  }

  const currentGolden = parseGoldenConfig(schedule.note);
  const patch: Parameters<typeof mergeScheduleMeta>[1] = {
    staffingPerSession: staffing,
  };
  if (currentGolden) {
    patch.golden = { ...currentGolden, staffingPerSession: staffing };
  }
  const { error } = await supabase
    .from("schedules")
    .update({
      note: mergeScheduleMeta(schedule.note, patch),
    })
    .eq("id", scheduleId);

  if (error) return { success: false as const, error: error.message };
  revalidatePath("/schedules");
  return { success: true as const, staffingPerSession: staffing };
}

function plannedHoursFromRange(clockIn: string, clockOut: string): number {
  const [inH, inM] = clockIn.slice(0, 5).split(":").map(Number);
  const [outH, outM] = clockOut.slice(0, 5).split(":").map(Number);
  const start = (inH ?? 0) * 60 + (inM ?? 0);
  const end = (outH ?? 0) * 60 + (outM ?? 0);
  const minutes = end >= start ? end - start : end + 24 * 60 - start;
  return Math.round((minutes / 60) * 100) / 100;
}

export async function updateSessionTimes(
  scheduleId: string,
  times: SessionTimesConfig
) {
  const { data: schedule, error: scheduleError } = await supabase
    .from("schedules")
    .select("id, clinic_id, status, note")
    .eq("id", scheduleId)
    .single();

  if (scheduleError || !schedule) {
    return { success: false as const, error: scheduleError?.message ?? "找不到班表" };
  }

  if (schedule.status === "published") {
    const snapResult = await ensurePublishedSnapshot(scheduleId);
    if (!snapResult.ok) return { success: false as const, error: snapResult.error };
  }

  const codes = ["MORNING", "AFTERNOON", "EVENING"] as const;
  for (const code of codes) {
    const range = times[code];
    if (!range?.clockIn || !range?.clockOut) continue;

    const { data: shiftType } = await supabase
      .from("shift_types")
      .select("id")
      .eq("clinic_id", schedule.clinic_id)
      .eq("code", code)
      .maybeSingle();

    if (!shiftType?.id) continue;

    const hours = plannedHoursFromRange(range.clockIn, range.clockOut);
    const { error: typeError } = await supabase
      .from("shift_types")
      .update({
        default_clock_in: range.clockIn,
        default_clock_out: range.clockOut,
        planned_hours: hours,
      })
      .eq("id", shiftType.id);
    if (typeError) return { success: false as const, error: typeError.message };

    const { error: assignError } = await supabase
      .from("shift_assignments")
      .update({
        expected_clock_in: range.clockIn,
        expected_clock_out: range.clockOut,
      })
      .eq("schedule_id", scheduleId)
      .eq("shift_type_id", shiftType.id);
    if (assignError) return { success: false as const, error: assignError.message };
  }

  const currentGolden = parseGoldenConfig(schedule.note);
  const patch: Parameters<typeof mergeScheduleMeta>[1] = { sessionTimes: times };
  if (currentGolden) {
    patch.golden = { ...currentGolden, sessionTimes: times };
  }
  const { error: noteError } = await supabase
    .from("schedules")
    .update({
      note: mergeScheduleMeta(schedule.note, patch),
    })
    .eq("id", scheduleId);

  if (noteError) return { success: false as const, error: noteError.message };
  revalidatePath("/schedules");
  return { success: true as const };
}

/** 半日診：清除該日所有晚診排班（保留早診） */
export async function markHalfDaySchedule(scheduleId: string, workDate: string) {
  const { data: schedule, error: scheduleError } = await supabase
    .from("schedules")
    .select("id, clinic_id, status, note")
    .eq("id", scheduleId)
    .single();

  if (scheduleError) return { success: false as const, error: scheduleError.message };
  if (schedule.status === "published") {
    const snapResult = await ensurePublishedSnapshot(scheduleId);
    if (!snapResult.ok) return { success: false as const, error: snapResult.error };
  }

  const { data: eveningType } = await supabase
    .from("shift_types")
    .select("id")
    .eq("clinic_id", schedule.clinic_id)
    .eq("code", "EVENING")
    .maybeSingle();

  if (!eveningType?.id) {
    return { success: false as const, error: "找不到晚診班別" };
  }

  const { error } = await supabase
    .from("shift_assignments")
    .delete()
    .eq("schedule_id", scheduleId)
    .eq("work_date", workDate)
    .eq("shift_type_id", eveningType.id);

  if (error) return { success: false as const, error: error.message };

  revalidatePath("/schedules");
  return { success: true as const };
}

async function ensurePublishedSnapshot(
  scheduleId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: schedule, error } = await supabase
    .from("schedules")
    .select("id, note")
    .eq("id", scheduleId)
    .single();

  if (error || !schedule) {
    return { ok: false, error: error?.message ?? "找不到班表" };
  }

  const meta = parseScheduleMeta(schedule.note);
  if (meta.publishedSnapshot && Object.keys(meta.publishedSnapshot).length > 0) {
    return { ok: true };
  }

  const { data: assignments, error: assignError } = await supabase
    .from("shift_assignments")
    .select("employee_id, work_date, shift_type_id")
    .eq("schedule_id", scheduleId);

  if (assignError) return { ok: false, error: assignError.message };

  const snapshot = flattenAssignmentSnapshot(
    buildAssignmentMap((assignments ?? []) as ShiftAssignment[])
  );
  const { error: updateError } = await supabase
    .from("schedules")
    .update({ note: mergeScheduleMeta(schedule.note, { publishedSnapshot: snapshot }) })
    .eq("id", scheduleId);

  if (updateError) return { ok: false, error: updateError.message };
  return { ok: true };
}

export async function confirmPublishedAmendments(scheduleId: string) {
  const { data: schedule, error } = await supabase
    .from("schedules")
    .select("id, note, status")
    .eq("id", scheduleId)
    .single();

  if (error || !schedule) {
    return { success: false as const, error: error?.message ?? "找不到班表" };
  }

  const { data: assignments, error: assignError } = await supabase
    .from("shift_assignments")
    .select("employee_id, work_date, shift_type_id")
    .eq("schedule_id", scheduleId);

  if (assignError) return { success: false as const, error: assignError.message };

  const snapshot = flattenAssignmentSnapshot(
    buildAssignmentMap((assignments ?? []) as ShiftAssignment[])
  );
  const { error: updateError } = await supabase
    .from("schedules")
    .update({ note: mergeScheduleMeta(schedule.note, { publishedSnapshot: snapshot }) })
    .eq("id", scheduleId);

  if (updateError) return { success: false as const, error: updateError.message };
  revalidatePath("/schedules");
  return { success: true as const };
}

export async function publishSchedule(scheduleId: string) {
  const { data: schedule, error: scheduleError } = await supabase
    .from("schedules")
    .select("id, note")
    .eq("id", scheduleId)
    .single();

  if (scheduleError || !schedule) {
    return { success: false as const, error: scheduleError?.message ?? "找不到班表" };
  }

  const snapResult = await ensurePublishedSnapshot(scheduleId);
  if (!snapResult.ok) return { success: false as const, error: snapResult.error };

  const { error: updateError } = await supabase
    .from("schedules")
    .update({ status: "published", published_at: new Date().toISOString() })
    .eq("id", scheduleId);

  if (updateError) return { success: false as const, error: updateError.message };

  const notifyResult = await notifySchedulePublished(scheduleId);

  revalidatePath("/schedules");
  return {
    success: true as const,
    notified: notifyResult.sent,
    notifyErrors: notifyResult.errors,
  };
}

async function notifySchedulePublished(scheduleId: string) {
  const { data: schedule } = await supabase
    .from("schedules")
    .select("id, clinic_id, year, month")
    .eq("id", scheduleId)
    .single();

  if (!schedule) return { sent: 0, errors: ["找不到班表"] };

  const { data: assignments } = await supabase
    .from("shift_assignments")
    .select("employee_id, work_date, shift_types(name)")
    .eq("schedule_id", scheduleId)
    .order("work_date");

  const { data: bindings } = await supabase
    .from("employee_line_bindings")
    .select("employee_id, line_user_id, employees(name)")
    .eq("is_active", true);

  const { data: employees } = await supabase
    .from("employees")
    .select("id, name")
    .eq("clinic_id", schedule.clinic_id)
    .eq("status", "active");

  let sent = 0;
  const errors: string[] = [];

  for (const employee of employees ?? []) {
    const binding = bindings?.find((b) => b.employee_id === employee.id);
    if (!binding?.line_user_id) continue;

    const myShifts = (assignments ?? [])
      .filter((a) => a.employee_id === employee.id)
      .map((a) => {
        const shiftName = (a.shift_types as { name?: string } | null)?.name ?? "班別";
        return `${a.work_date} ${shiftName}`;
      });

    const summary =
      myShifts.length > 0
        ? myShifts.slice(0, 10).join("\n") +
          (myShifts.length > 10 ? `\n...共 ${myShifts.length} 班` : "")
        : "";

    const message = buildSchedulePublishedMessage(
      employee.name,
      schedule.year,
      schedule.month,
      summary
    );

    const result = await pushLineMessage(binding.line_user_id, [message]);
    if (result.ok) {
      sent++;
      await supabase.from("notifications").insert({
        employee_id: employee.id,
        clinic_id: schedule.clinic_id,
        type: "schedule_published",
        title: "班表發布通知",
        body: message.text,
        sent_at: new Date().toISOString(),
        notified_via: ["line"],
      });
    } else {
      errors.push(`${employee.name}: ${result.error}`);
    }
  }

  return { sent, errors };
}

/** 套用黃金班表班別（08:20 早診 / 16:00 晚診 / 例假 / 休息日） */
export async function applyClinicGoldenTemplate(options?: { skipRevalidate?: boolean }) {
  const clinic = await getDefaultClinic();
  const template = getShiftTemplate();

  for (const slot of template.slots) {
    const isActive =
      slot.planned_hours > 0 ||
      slot.code === "STATUTORY" ||
      slot.code === "REST" ||
      slot.code === "ANNUAL_LEAVE" ||
      slot.code === "CLOSED";

    const { data: existing } = await supabase
      .from("shift_types")
      .select("id")
      .eq("clinic_id", clinic.id)
      .eq("code", slot.code)
      .maybeSingle();

    const payload = {
      clinic_id: clinic.id,
      code: slot.code,
      name: slot.name,
      category: slot.category,
      default_clock_in: slot.default_clock_in,
      default_clock_out: slot.default_clock_out,
      planned_hours: slot.planned_hours,
      color_hex: slot.color_hex,
      sort_order: slot.sort_order,
      is_active: isActive,
    };

    if (existing) {
      await supabase.from("shift_types").update(payload).eq("id", existing.id);
    } else {
      await supabase.from("shift_types").insert(payload);
    }
  }

  await supabase
    .from("shift_types")
    .update({ is_active: true })
    .eq("clinic_id", clinic.id)
    .in("code", ["MORNING", "AFTERNOON", "EVENING", "STATUTORY", "REST", "ANNUAL_LEAVE", "CLOSED"]);

  if (!options?.skipRevalidate) {
    revalidatePath("/schedules");
  }
  return { success: true as const, template: template.label };
}

/** 標記診所休診日（需指定原因：修假／國定／颱風，影響薪資加發） */
export async function markClinicClosureDay(
  scheduleId: string,
  workDate: string,
  mode: "planned" | "temporary",
  creditHours?: number,
  reason: ClosureReason = "voluntary",
  reasonNote?: string
) {
  const { data: schedule, error: schErr } = await supabase
    .from("schedules")
    .select("id, clinic_id, year, month, status, note")
    .eq("id", scheduleId)
    .single();

  if (schErr) return { success: false as const, error: schErr.message };

  const { data: closedType } = await supabase
    .from("shift_types")
    .select("id")
    .eq("clinic_id", schedule.clinic_id)
    .eq("code", "CLOSED")
    .maybeSingle();

  const { data: restType } = await supabase
    .from("shift_types")
    .select("id")
    .eq("clinic_id", schedule.clinic_id)
    .eq("code", "REST")
    .maybeSingle();

  if (!closedType?.id) return { success: false as const, error: "請先套用班別模板（含休診）" };

  const { data: employees } = await supabase
    .from("employees")
    .select("id")
    .eq("clinic_id", schedule.clinic_id)
    .eq("status", "active");

  const isPublished = schedule.status === "published";
  const effectiveMode = isPublished ? "temporary" : mode;
  const effectiveReason = normalizeClosureReason(reason);
  const isHolidayLike =
    effectiveReason === "national" || effectiveReason === "typhoon";

  // 修假預告→休息日（計入四週休息）；國定／颱風→休診碼（不灌水休息日數）
  const useRestDay = effectiveMode === "planned" && !isHolidayLike && !!restType?.id;

  for (const emp of employees ?? []) {
    await supabase
      .from("shift_assignments")
      .delete()
      .eq("schedule_id", scheduleId)
      .eq("employee_id", emp.id)
      .eq("work_date", workDate);

    if (useRestDay) {
      await supabase.from("shift_assignments").insert({
        schedule_id: scheduleId,
        employee_id: emp.id,
        shift_type_id: restType!.id,
        work_date: workDate,
        expected_clock_in: "00:00",
        expected_clock_out: "00:00",
        status: "scheduled",
        note: "診所修假→休息日",
      });
    } else {
      const hours = creditHours ?? 7.67;
      const reasonLabel =
        effectiveReason === "national"
          ? "國定假日休診"
          : effectiveReason === "typhoon"
            ? "颱風／天然災害停診"
            : "診所休診";
      await supabase.from("shift_assignments").insert({
        schedule_id: scheduleId,
        employee_id: emp.id,
        shift_type_id: closedType.id,
        work_date: workDate,
        expected_clock_in: "00:00",
        expected_clock_out: "00:00",
        status: "scheduled",
        note:
          effectiveMode === "temporary"
            ? `closure_credit:${hours}|${reasonLabel}`
            : reasonLabel,
      });
    }
  }

  const meta = parseScheduleMeta(schedule.note);
  const closures: ClosureRecord[] = [
    ...(meta.closures ?? []).filter((c) => c.date !== workDate),
    {
      date: workDate,
      mode: effectiveMode,
      reason: effectiveReason,
      creditHours: creditHours ?? 7.67,
      note: reasonNote?.trim() || undefined,
    },
  ];

  let nationalHolidays = [...(meta.nationalHolidays ?? [])];
  if (isHolidayLike) {
    if (!nationalHolidays.includes(workDate)) {
      nationalHolidays = [...nationalHolidays, workDate];
    }
  } else {
    nationalHolidays = nationalHolidays.filter((d) => d !== workDate);
  }

  await supabase
    .from("schedules")
    .update({
      note: mergeScheduleMeta(schedule.note, { closures, nationalHolidays }),
    })
    .eq("id", scheduleId);

  revalidatePath("/schedules");
  return {
    success: true as const,
    mode: effectiveMode,
    reason: effectiveReason,
  };
}

/**
 * 刪除班表下所有排班前，先解除打卡／警示／換班對 assignment 的外鍵，
 * 避免 clock_records_assignment_id_fkey 擋住「一鍵產生黃金班表」。
 * 打卡紀錄本體不刪，僅清空 assignment_id。
 */
async function clearScheduleAssignments(scheduleId: string): Promise<string | null> {
  const { data: existing, error: listError } = await supabase
    .from("shift_assignments")
    .select("id")
    .eq("schedule_id", scheduleId);

  if (listError) return listError.message;

  const ids = (existing ?? []).map((a) => a.id);
  if (ids.length === 0) return null;

  const { error: clockErr } = await supabase
    .from("clock_records")
    .update({ assignment_id: null })
    .in("assignment_id", ids);
  if (clockErr) return clockErr.message;

  await supabase
    .from("compliance_alerts")
    .update({ assignment_id: null })
    .in("assignment_id", ids);

  await supabase.from("shift_swap_requests").delete().in("original_assignment_id", ids);
  await supabase.from("shift_swap_requests").delete().in("proposed_assignment_id", ids);

  // 015：ON DELETE SET NULL，仍先清較穩妥
  await supabase
    .from("clock_correction_requests")
    .update({ assignment_id: null })
    .in("assignment_id", ids);

  const { error: deleteError } = await supabase
    .from("shift_assignments")
    .delete()
    .eq("schedule_id", scheduleId);

  return deleteError?.message ?? null;
}

export async function generateGoldenSchedule(
  scheduleId: string,
  config: GoldenScheduleConfig,
  options?: { allowPublished?: boolean }
) {
  const mode = config.mode === "triple" ? "triple" : "dual";
  const sessionPattern = normalizeSessionPattern(config.sessionPattern);
  const staffingPerSession = clampStaffingPerSession(config.staffingPerSession);

  if (config.employeeAId === config.employeeBId) {
    return { success: false as const, error: "員工 A 與 B 不可為同一人" };
  }
  if (mode === "triple") {
    if (!config.employeeCId) {
      return { success: false as const, error: "三人制請選擇員工 C" };
    }
    if (
      config.employeeCId === config.employeeAId ||
      config.employeeCId === config.employeeBId
    ) {
      return { success: false as const, error: "員工 A／B／C 必須為不同人" };
    }
  }

  const { data: schedule, error: scheduleError } = await supabase
    .from("schedules")
    .select("id, clinic_id, year, month, status, note")
    .eq("id", scheduleId)
    .single();

  if (scheduleError) return { success: false as const, error: scheduleError.message };
  if (schedule.status === "published" && !options?.allowPublished) {
    return { success: false as const, error: "已發布的班表無法重新產生" };
  }
  if (schedule.status === "published") {
    const snapResult = await ensurePublishedSnapshot(scheduleId);
    if (!snapResult.ok) return { success: false as const, error: snapResult.error };
  }

  await applyClinicGoldenTemplate({ skipRevalidate: true });

  const { data: shiftTypes, error: stError } = await supabase
    .from("shift_types")
    .select("id, code, default_clock_in, default_clock_out, planned_hours")
    .eq("clinic_id", schedule.clinic_id)
    .eq("is_active", true);

  if (stError) return { success: false as const, error: stError.message };

  const codeToId = Object.fromEntries((shiftTypes ?? []).map((s) => [s.code, s.id]));
  const daysInMonth = getDaysInMonth(schedule.year, schedule.month);

  const generated = generateGoldenMonthSchedule(
    schedule.year,
    schedule.month,
    daysInMonth,
    {
      mode,
      employeeAId: config.employeeAId,
      employeeBId: config.employeeBId,
      employeeCId: config.employeeCId,
      oddWeekTrackForA: config.oddWeekTrackForA ?? 1,
    },
    shiftTypes ?? []
  );

  const clearError = await clearScheduleAssignments(scheduleId);
  if (clearError) {
    return {
      success: false as const,
      error: `無法覆蓋舊班表：${clearError}（打卡紀錄已保留，僅解除與舊班次的連結後再重試）`,
    };
  }

  const rows = generated.flatMap((g) => {
    if (sessionPattern === "two" && g.shiftCode === "AFTERNOON") return [];
    const shiftTypeId = codeToId[g.shiftCode];
    if (!shiftTypeId) return [];
    const overlay =
      g.shiftCode === "MORNING" ||
      g.shiftCode === "AFTERNOON" ||
      g.shiftCode === "EVENING"
        ? config.sessionTimes?.[g.shiftCode]
        : undefined;
    return [
      {
        schedule_id: scheduleId,
        employee_id: g.employeeId,
        shift_type_id: shiftTypeId,
        work_date: g.workDate,
        expected_clock_in: overlay?.clockIn ?? g.expectedClockIn,
        expected_clock_out: overlay?.clockOut ?? g.expectedClockOut,
        status: "scheduled" as const,
        note: g.label,
      },
    ];
  });

  if (rows.length === 0) {
    return {
      success: false as const,
      error:
        mode === "triple"
          ? "無法產生三人班表，請先套用黃金班別（需含早／午／晚診）"
          : "無法產生班表，請先套用黃金班別",
    };
  }

  const { error: insertError } = await supabase.from("shift_assignments").insert(rows);
  if (insertError) return { success: false as const, error: insertError.message };

  await supabase
    .from("schedules")
    .update({
      note: mergeScheduleMeta(schedule.note, {
        sessionPattern,
        staffingPerSession,
        sessionTimes: config.sessionTimes,
        golden: {
          mode,
          employeeAId: config.employeeAId,
          employeeBId: config.employeeBId,
          employeeCId: mode === "triple" ? config.employeeCId : undefined,
          oddWeekTrackForA: config.oddWeekTrackForA ?? 1,
          sessionPattern,
          staffingPerSession,
          sessionTimes: config.sessionTimes,
        },
      }),
    })
    .eq("id", scheduleId);

  revalidatePath("/schedules");

  const assignmentMap = buildAssignmentMap(
    rows.map((row) => ({
      id: "",
      schedule_id: row.schedule_id,
      employee_id: row.employee_id,
      shift_type_id: row.shift_type_id,
      work_date: row.work_date,
      expected_clock_in: row.expected_clock_in,
      expected_clock_out: row.expected_clock_out,
      status: row.status,
    }))
  );

  return { success: true as const, count: rows.length, assignmentMap, mode, sessionPattern };
}

export async function bindLineUser(employeeId: string, lineUserId: string, displayName?: string) {
  const { error } = await supabase.from("employee_line_bindings").upsert(
    {
      employee_id: employeeId,
      line_user_id: lineUserId,
      display_name: displayName ?? null,
      is_active: true,
      bound_at: new Date().toISOString(),
    },
    { onConflict: "line_user_id" }
  );

  if (error) return { success: false as const, error: error.message };
  return { success: true as const };
}

export { formatWorkDate, getDefaultClinicId, buildGoldenShiftSlots };
