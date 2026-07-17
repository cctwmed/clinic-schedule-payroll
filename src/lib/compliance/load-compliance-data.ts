import { supabase } from "@/lib/supabase";
import type { ClockEvent, DayOffRecord, WorkShiftBlock } from "@/lib/compliance/types";

export async function loadComplianceData(
  clinicId: string,
  periodStart: string,
  periodEnd: string
) {
  const { data: employees } = await supabase
    .from("employees")
    .select("id, name")
    .eq("clinic_id", clinicId)
    .eq("status", "active");

  const { data: assignments, error: assignError } = await supabase
    .from("shift_assignments")
    .select(
      "employee_id, work_date, expected_clock_in, expected_clock_out, note, shift_types(code, name, planned_hours), schedules!inner(clinic_id)"
    )
    .eq("schedules.clinic_id", clinicId)
    .gte("work_date", periodStart)
    .lte("work_date", periodEnd)
    .neq("status", "cancelled");

  if (assignError) throw new Error(assignError.message);

  const { data: clocks, error: clockError } = await supabase
    .from("clock_records")
    .select(
      "employee_id, clock_type, clocked_at, payable_clocked_at, early_work_approved, employees!inner(clinic_id)"
    )
    .eq("employees.clinic_id", clinicId)
    .gte("clock_date", periodStart)
    .lte("clock_date", periodEnd);

  let clockRows = clocks;
  if (clockError) {
    if (/payable_clocked_at|early_work_approved|does not exist/i.test(clockError.message)) {
      const fallback = await supabase
        .from("clock_records")
        .select("employee_id, clock_type, clocked_at, employees!inner(clinic_id)")
        .eq("employees.clinic_id", clinicId)
        .gte("clock_date", periodStart)
        .lte("clock_date", periodEnd);
      if (fallback.error) throw new Error(fallback.error.message);
      clockRows = (fallback.data ?? []).map((c) => ({
        ...c,
        payable_clocked_at: null,
        early_work_approved: false,
      }));
    } else {
      throw new Error(clockError.message);
    }
  }

  const shifts: WorkShiftBlock[] = [];
  const dayOffs: DayOffRecord[] = [];

  for (const a of assignments ?? []) {
    const st = parseShiftTypeJoin(a.shift_types);
    const code = st?.code ?? "";

    if (code === "STATUTORY") {
      dayOffs.push({
        date: a.work_date,
        employeeId: a.employee_id,
        type: "statutory",
      });
      continue;
    }
    if (code === "REST") {
      dayOffs.push({
        date: a.work_date,
        employeeId: a.employee_id,
        type: "rest",
      });
      continue;
    }
    if (code === "ANNUAL_LEAVE") {
      dayOffs.push({
        date: a.work_date,
        employeeId: a.employee_id,
        type: "annual_leave",
      });
      continue;
    }
    if (code === "CLOSED") {
      const credit = parseClosureCredit(a.note, Number(st?.planned_hours ?? 0));
      if (credit > 0) {
        shifts.push({
          date: a.work_date,
          employeeId: a.employee_id,
          shiftCode: "CLOSED",
          shiftName: st?.name ?? "診所休診",
          plannedHours: credit,
          clockIn: null,
          clockOut: null,
          expectedStart: "00:00",
          expectedEnd: "00:00",
        });
      }
      continue;
    }

    shifts.push({
      date: a.work_date,
      employeeId: a.employee_id,
      shiftCode: code,
      shiftName: st?.name,
      plannedHours: Number(st?.planned_hours ?? 0),
      clockIn: null,
      clockOut: null,
      expectedStart: String(a.expected_clock_in),
      expectedEnd: String(a.expected_clock_out),
    });
  }

  const clockEvents: ClockEvent[] = (clockRows ?? []).map((c) => ({
    employeeId: c.employee_id,
    clockType: c.clock_type as ClockEvent["clockType"],
    clockedAt: c.clocked_at,
    payableClockedAt: (c as { payable_clocked_at?: string | null }).payable_clocked_at ?? null,
    earlyWorkApproved: Boolean((c as { early_work_approved?: boolean }).early_work_approved),
  }));

  return {
    employees: employees ?? [],
    shifts,
    dayOffs,
    clocks: clockEvents,
  };
}

export function monthPeriod(year: number, month: number) {
  const start = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const end = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return { start, end };
}

/** 合規檢查需含四週滑動窗口，向前延伸 27 天 */
export function compliancePeriod(year: number, month: number) {
  const { start, end } = monthPeriod(year, month);
  const extStart = new Date(`${start}T12:00:00+08:00`);
  extStart.setTime(extStart.getTime() - 27 * 86_400_000);
  const extStartStr = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(extStart);
  return { start: extStartStr, end, monthStart: start, monthEnd: end };
}

function parseClosureCredit(note: unknown, plannedHours: number): number {
  if (typeof note === "string" && note.includes("closure_credit:")) {
    const m = note.match(/closure_credit:([\d.]+)/);
    if (m) return Number(m[1]);
  }
  return plannedHours > 0 ? plannedHours : 0;
}

function parseShiftTypeJoin(raw: unknown): {
  code: string;
  name: string;
  planned_hours: number;
} | null {
  if (!raw) return null;
  const item = Array.isArray(raw) ? raw[0] : raw;
  if (!item || typeof item !== "object") return null;
  const s = item as { code?: string; name?: string; planned_hours?: number };
  return {
    code: s.code ?? "",
    name: s.name ?? "",
    planned_hours: Number(s.planned_hours ?? 0),
  };
}
