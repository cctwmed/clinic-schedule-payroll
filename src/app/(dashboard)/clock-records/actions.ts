"use server";

import { revalidatePath } from "next/cache";
import { supabase } from "@/lib/supabase";
import { getDefaultClinic, taipeiToday } from "@/lib/clinic";
import { applyClockRecordCorrection } from "@/lib/clock/correct-record";
import type { ClockType } from "@/lib/clock/session";

export interface ClockRecordRow {
  id: string;
  employee_id: string;
  employee_name: string;
  employee_no: string;
  assignment_id: string | null;
  clock_type: string;
  clocked_at: string;
  clock_date: string;
  latitude: number | null;
  longitude: number | null;
  distance_from_clinic_m: number | null;
  validation: string;
  source: string;
  is_late: boolean;
  late_minutes: number;
  is_manually_corrected: boolean;
  corrected_by: string | null;
  corrected_at: string | null;
  original_clocked_at: string | null;
  note: string | null;
  shift_name: string | null;
}

export async function fetchClockRecordsPageData(date?: string) {
  const clinic = await getDefaultClinic();
  const targetDate = date ?? taipeiToday();

  const { data: records, error } = await supabase
    .from("clock_records")
    .select(
      `
      id,
      employee_id,
      assignment_id,
      clock_type,
      clocked_at,
      clock_date,
      latitude,
      longitude,
      distance_from_clinic_m,
      validation,
      source,
      is_late,
      late_minutes,
      is_manually_corrected,
      corrected_by,
      corrected_at,
      original_clocked_at,
      note,
      employees(name, employee_no),
      shift_assignments(shift_types(name))
    `
    )
    .eq("clock_date", targetDate)
    .order("clocked_at", { ascending: false });

  if (error) throw new Error(error.message);

  const rows: ClockRecordRow[] = (records ?? []).map((r) => {
    const emp = parseJoin(r.employees) as { name?: string; employee_no?: string } | null;
    const assign = parseJoin(r.shift_assignments) as {
      shift_types?: unknown;
    } | null;
    const shiftTypes = parseJoin(assign?.shift_types) as { name?: string } | null;

    return {
      id: r.id,
      employee_id: r.employee_id,
      employee_name: emp?.name ?? "—",
      employee_no: emp?.employee_no ?? "",
      assignment_id: r.assignment_id,
      clock_type: r.clock_type,
      clocked_at: r.clocked_at,
      clock_date: r.clock_date,
      latitude: r.latitude != null ? Number(r.latitude) : null,
      longitude: r.longitude != null ? Number(r.longitude) : null,
      distance_from_clinic_m:
        r.distance_from_clinic_m != null ? Number(r.distance_from_clinic_m) : null,
      validation: r.validation,
      source: r.source,
      is_late: Boolean(r.is_late),
      late_minutes: Number(r.late_minutes ?? 0),
      is_manually_corrected: Boolean(r.is_manually_corrected),
      corrected_by: r.corrected_by,
      corrected_at: r.corrected_at,
      original_clocked_at: r.original_clocked_at,
      note: r.note,
      shift_name: shiftTypes?.name ?? null,
    };
  });

  return {
    clinic,
    date: targetDate,
    records: rows,
  };
}

export async function correctClockRecord(input: {
  recordId: string;
  clockedAt: string;
  clockType: string;
  note: string;
  correctedBy: string;
}) {
  const result = await applyClockRecordCorrection({
    recordId: input.recordId,
    clockedAt: input.clockedAt,
    clockType: input.clockType as ClockType,
    note: input.note,
    correctedBy: input.correctedBy,
  });

  if (!result.success) {
    return { success: false as const, error: result.error };
  }

  revalidatePath("/clock-records");
  return { success: true as const };
}

function parseJoin(raw: unknown): unknown {
  if (Array.isArray(raw)) return raw[0] ?? null;
  return raw ?? null;
}
