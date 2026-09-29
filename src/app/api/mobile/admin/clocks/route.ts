import { NextRequest, NextResponse } from "next/server";
import { assertMobileAdmin } from "@/lib/employee/liff-admin";
import { getDefaultClinic, taipeiToday } from "@/lib/clinic";
import { isWorkAssignment } from "@/lib/clock/session";
import { supabase } from "@/lib/supabase";

const OFF_CODES = new Set(["STATUTORY", "REST", "ANNUAL_LEAVE", "CLOSED"]);

const FULL_SELECT = `
  id, employee_id, assignment_id, clock_type, clocked_at, clock_date,
  is_late, late_minutes, is_early_abnormal, early_minutes, is_manually_corrected, note,
  employees(name, employee_no, clinic_id),
  shift_assignments(shift_types(code, name))
`;

const BASIC_SELECT = `
  id, employee_id, assignment_id, clock_type, clocked_at, clock_date,
  is_late, late_minutes, is_manually_corrected, note,
  employees(name, employee_no, clinic_id)
`;

const MIN_SELECT = `
  id, employee_id, assignment_id, clock_type, clocked_at, clock_date,
  is_late, late_minutes
`;

function parseJoin<T>(raw: unknown): T | null {
  if (!raw) return null;
  const item = Array.isArray(raw) ? raw[0] : raw;
  if (!item || typeof item !== "object") return null;
  return item as T;
}

function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function addDaysTaipei(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T12:00:00+08:00`);
  d.setTime(d.getTime() + days * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

async function loadClockRows(date: string): Promise<Record<string, unknown>[]> {
  const attempts = [FULL_SELECT, BASIC_SELECT, MIN_SELECT];
  let lastError = "載入打卡失敗";
  for (const select of attempts) {
    const { data, error } = await supabase
      .from("clock_records")
      .select(select)
      .eq("clock_date", date)
      .order("clocked_at", { ascending: true })
      .limit(200);
    if (!error) return ((data ?? []) as unknown as Record<string, unknown>[]);
    lastError = error.message;
  }
  throw new Error(lastError);
}

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

    const clinic = await getDefaultClinic();
    const requested = request.nextUrl.searchParams.get("date") ?? taipeiToday();
    const date = isIsoDate(requested) ? requested : taipeiToday();

    const { data: employees } = await supabase
      .from("employees")
      .select("id, name, employee_no, clinic_id")
      .eq("clinic_id", clinic.id);

    const empMap = new Map(
      (employees ?? []).map((e) => [
        String(e.id),
        {
          name: e.name as string,
          employeeNo: String(e.employee_no ?? ""),
        },
      ])
    );
    const clinicEmpIds = new Set(empMap.keys());

    const rows = await loadClockRows(date);
    const records = rows
      .map((row) => {
        const emp = parseJoin<{
          name?: string;
          employee_no?: string;
          clinic_id?: string;
        }>(row.employees);
        const employeeId = String(row.employee_id ?? "");
        if (clinicEmpIds.size > 0 && employeeId && !clinicEmpIds.has(employeeId)) {
          return null;
        }
        if (emp?.clinic_id && emp.clinic_id !== clinic.id) return null;

        const assignment = parseJoin<{ shift_types?: unknown }>(row.shift_assignments);
        const shift = parseJoin<{ code?: string; name?: string }>(assignment?.shift_types);

        return {
          id: String(row.id),
          employeeId,
          name: empMap.get(employeeId)?.name ?? emp?.name ?? "同仁",
          employeeNo: empMap.get(employeeId)?.employeeNo ?? emp?.employee_no ?? "",
          assignmentId: row.assignment_id ? String(row.assignment_id) : null,
          clockType: String(row.clock_type ?? ""),
          clockedAt: String(row.clocked_at ?? ""),
          shiftName: shift?.name ?? null,
          isLate: Boolean(row.is_late),
          lateMinutes: Number(row.late_minutes ?? 0),
          isEarlyAbnormal: Boolean(row.is_early_abnormal),
          earlyMinutes: Number(row.early_minutes ?? 0),
          isManuallyCorrected: Boolean(row.is_manually_corrected),
        };
      })
      .filter((row): row is NonNullable<typeof row> => row !== null);

    const peopleMap = new Map<
      string,
      {
        employeeId: string;
        name: string;
        employeeNo: string;
        records: typeof records;
      }
    >();
    for (const rec of records) {
      const current = peopleMap.get(rec.employeeId) ?? {
        employeeId: rec.employeeId,
        name: rec.name,
        employeeNo: rec.employeeNo,
        records: [],
      };
      current.records.push(rec);
      peopleMap.set(rec.employeeId, current);
    }
    const people = [...peopleMap.values()].sort((a, b) =>
      (a.employeeNo || a.name).localeCompare(b.employeeNo || b.name, "zh-Hant")
    );

    const clockInByAssignment = new Set(
      records
        .filter((r) => r.clockType === "clock_in" && r.assignmentId)
        .map((r) => r.assignmentId as string)
    );
    const clockInByEmployee = new Set(
      records.filter((r) => r.clockType === "clock_in").map((r) => r.employeeId)
    );

    let missing: {
      assignmentId: string;
      name: string;
      shiftName: string;
      expectedIn: string;
    }[] = [];
    const { data: assignments, error: assignError } = await supabase
      .from("shift_assignments")
      .select(
        "id, employee_id, expected_clock_in, expected_clock_out, employees(name, clinic_id), shift_types(code, name)"
      )
      .eq("work_date", date)
      .neq("status", "cancelled");

    if (!assignError) {
      missing = (assignments ?? [])
        .map((row) => {
          const emp = parseJoin<{ name?: string; clinic_id?: string }>(row.employees);
          const shift = parseJoin<{ code?: string; name?: string }>(row.shift_types);
          const employeeId = String(row.employee_id ?? "");
          const code = shift?.code ?? "";
          if (OFF_CODES.has(code) || !isWorkAssignment(code)) return null;
          if (clinicEmpIds.size > 0 && employeeId && !clinicEmpIds.has(employeeId)) {
            return null;
          }
          if (emp?.clinic_id && emp.clinic_id !== clinic.id) return null;
          if (clockInByAssignment.has(String(row.id))) return null;
          if (!row.id && clockInByEmployee.has(employeeId)) return null;
          return {
            assignmentId: String(row.id),
            name: empMap.get(employeeId)?.name ?? emp?.name ?? "同仁",
            shiftName: shift?.name ?? "班別",
            expectedIn: String(row.expected_clock_in ?? "").slice(0, 5),
          };
        })
        .filter((row): row is NonNullable<typeof row> => row !== null);
    }

    return NextResponse.json({
      date,
      prevDate: addDaysTaipei(date, -1),
      nextDate: addDaysTaipei(date, 1),
      today: taipeiToday(),
      summary: {
        staffCount: people.length,
        clockCount: records.length,
        lateCount: records.filter((r) => r.isLate).length,
        earlyCount: records.filter((r) => r.isEarlyAbnormal).length,
        missingCount: missing.length,
      },
      missing,
      people,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "載入出勤失敗" },
      { status: 500 }
    );
  }
}
