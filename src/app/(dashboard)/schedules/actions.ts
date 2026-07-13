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
  formatWorkDate,
  getDaysInMonth,
  OFF_DAY_CATEGORIES,
} from "@/types/schedule";
import { checkCompliance } from "@/lib/compliance/check-compliance";
import { compliancePeriod, loadComplianceData, monthPeriod } from "@/lib/compliance/load-compliance-data";
import type { ComplianceIssue } from "@/lib/compliance/types";
import { buildGoldenShiftSlots, getShiftTemplate } from "@/lib/shift-templates";
import {
  parseGoldenConfig,
  parseScheduleMeta,
  mergeScheduleMeta,
  type GoldenScheduleConfig,
  type ClosureRecord,
} from "@/lib/schedules/golden-config";
import { generateGoldenMonthSchedule } from "@/lib/schedules/golden-rotation";
import { validateSameDayAssignment } from "@/lib/schedules/assignment-validation";
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
      .select("id, name, employee_no, job_title")
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

  const compPeriod = compliancePeriod(year, month);
  const complianceData = await loadComplianceData(clinic.id, compPeriod.start, compPeriod.end);
  const complianceIssues: ComplianceIssue[] = checkCompliance({
    periodStart: compPeriod.start,
    periodEnd: compPeriod.end,
    shifts: complianceData.shifts,
    dayOffs: complianceData.dayOffs,
    clocks: complianceData.clocks,
    employeeIds: (employees ?? []).map((e) => ({ id: e.id, name: e.name })),
    employeeAId: goldenConfig?.employeeAId,
    oddWeekTrackForA: goldenConfig?.oddWeekTrackForA ?? 1,
  }).filter(
    (i) => !i.date || (i.date >= compPeriod.monthStart && i.date <= compPeriod.monthEnd)
  );

  const publicHolidays = listTaiwanPublicHolidaysInRange(monthStart, monthEnd);

  return {
    clinic,
    schedule,
    shiftTypes: workShiftTypes,
    offDayShiftTypes,
    employees: (employees ?? []) as ScheduleEmployee[],
    assignmentMap,
    daysInMonth: getDaysInMonth(year, month),
    complianceIssues,
    goldenConfig,
    closures: scheduleMeta.closures ?? [],
    publicHolidays,
  };
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
    map[a.work_date][a.shift_type_id] = a.employee_id;
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

export async function saveScheduleAssignment(
  scheduleId: string,
  workDate: string,
  shiftTypeId: string,
  employeeId: string | null,
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
    return { success: false as const, error: "已發布的班表無法直接修改，請先複製為新月份草稿" };
  }

  if (!employeeId) {
    const { error } = await supabase
      .from("shift_assignments")
      .delete()
      .eq("schedule_id", scheduleId)
      .eq("work_date", workDate)
      .eq("shift_type_id", shiftTypeId);

    if (error) return { success: false as const, error: error.message };
    return { success: true as const };
  }

  const conflict = await validateAssignmentConflict(
    scheduleId,
    workDate,
    shiftTypeId,
    employeeId
  );
  if (!conflict.ok) {
    return { success: false as const, error: conflict.error };
  }

  const { data: existing } = await supabase
    .from("shift_assignments")
    .select("id")
    .eq("schedule_id", scheduleId)
    .eq("work_date", workDate)
    .eq("shift_type_id", shiftTypeId)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from("shift_assignments")
      .update({
        employee_id: employeeId,
        expected_clock_in: expectedClockIn,
        expected_clock_out: expectedClockOut,
      })
      .eq("id", existing.id);

    if (error) return { success: false as const, error: error.message };
  } else {
    const { error } = await supabase.from("shift_assignments").insert({
      schedule_id: scheduleId,
      employee_id: employeeId,
      shift_type_id: shiftTypeId,
      work_date: workDate,
      expected_clock_in: expectedClockIn,
      expected_clock_out: expectedClockOut,
      status: "scheduled",
    });

    if (error) return { success: false as const, error: error.message };
  }

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
    return { success: false as const, error: "已發布的班表無法直接修改" };
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

export async function publishSchedule(scheduleId: string) {
  const { error: scheduleError } = await supabase
    .from("schedules")
    .select("id")
    .eq("id", scheduleId)
    .single();

  if (scheduleError) return { success: false as const, error: scheduleError.message };

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
export async function applyClinicGoldenTemplate() {
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
    .update({ is_active: false })
    .eq("clinic_id", clinic.id)
    .eq("code", "AFTERNOON");

  revalidatePath("/schedules");
  return { success: true as const, template: template.label };
}

/** 標記診所休診日（公佈前→休息日；公佈後→臨時休診並計入工時） */
export async function markClinicClosureDay(
  scheduleId: string,
  workDate: string,
  mode: "planned" | "temporary",
  creditHours?: number
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

  for (const emp of employees ?? []) {
    await supabase
      .from("shift_assignments")
      .delete()
      .eq("schedule_id", scheduleId)
      .eq("employee_id", emp.id)
      .eq("work_date", workDate);

    if (effectiveMode === "planned" && restType?.id) {
      await supabase.from("shift_assignments").insert({
        schedule_id: scheduleId,
        employee_id: emp.id,
        shift_type_id: restType.id,
        work_date: workDate,
        expected_clock_in: "00:00",
        expected_clock_out: "00:00",
        status: "scheduled",
        note: "預告休診→休息日",
      });
    } else {
      const hours = creditHours ?? 7.67;
      await supabase.from("shift_assignments").insert({
        schedule_id: scheduleId,
        employee_id: emp.id,
        shift_type_id: closedType.id,
        work_date: workDate,
        expected_clock_in: "00:00",
        expected_clock_out: "00:00",
        status: "scheduled",
        note: `closure_credit:${hours}`,
      });
    }
  }

  const closures: ClosureRecord[] = [
    ...(parseScheduleMeta(schedule.note).closures ?? []).filter((c) => c.date !== workDate),
    { date: workDate, mode: effectiveMode, creditHours: creditHours ?? 7.67 },
  ];

  await supabase
    .from("schedules")
    .update({ note: mergeScheduleMeta(schedule.note, { closures }) })
    .eq("id", scheduleId);

  revalidatePath("/schedules");
  return { success: true as const, mode: effectiveMode };
}

export async function generateGoldenSchedule(
  scheduleId: string,
  config: GoldenScheduleConfig
) {
  if (config.employeeAId === config.employeeBId) {
    return { success: false as const, error: "員工 A 與 B 不可為同一人" };
  }

  const { data: schedule, error: scheduleError } = await supabase
    .from("schedules")
    .select("id, clinic_id, year, month, status, note")
    .eq("id", scheduleId)
    .single();

  if (scheduleError) return { success: false as const, error: scheduleError.message };
  if (schedule.status === "published") {
    return { success: false as const, error: "已發布的班表無法重新產生" };
  }

  await applyClinicGoldenTemplate();

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
      employeeAId: config.employeeAId,
      employeeBId: config.employeeBId,
      oddWeekTrackForA: config.oddWeekTrackForA ?? 1,
    },
    shiftTypes ?? []
  );

  const { error: deleteError } = await supabase
    .from("shift_assignments")
    .delete()
    .eq("schedule_id", scheduleId);

  if (deleteError) return { success: false as const, error: deleteError.message };

  const rows = generated.flatMap((g) => {
    const shiftTypeId = codeToId[g.shiftCode];
    if (!shiftTypeId) return [];
    return [
      {
        schedule_id: scheduleId,
        employee_id: g.employeeId,
        shift_type_id: shiftTypeId,
        work_date: g.workDate,
        expected_clock_in: g.expectedClockIn,
        expected_clock_out: g.expectedClockOut,
        status: "scheduled" as const,
        note: g.label,
      },
    ];
  });

  if (rows.length === 0) {
    return { success: false as const, error: "無法產生班表，請先套用黃金班別" };
  }

  const { error: insertError } = await supabase.from("shift_assignments").insert(rows);
  if (insertError) return { success: false as const, error: insertError.message };

  await supabase
    .from("schedules")
    .update({
      note: mergeScheduleMeta(schedule.note, {
        golden: { ...config, oddWeekTrackForA: config.oddWeekTrackForA ?? 1 },
      }),
    })
    .eq("id", scheduleId);

  revalidatePath("/schedules");
  return { success: true as const, count: rows.length };
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
