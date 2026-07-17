"use server";

import { revalidatePath } from "next/cache";
import { supabase } from "@/lib/supabase";
import { getDefaultClinic, taipeiToday } from "@/lib/clinic";
import { applyClockRecordCorrection } from "@/lib/clock/correct-record";
import { setEarlyWorkApproval } from "@/lib/clock/early-punch-review";
import {
  fetchPendingCorrectionRequests,
  reviewCorrectionRequest,
  type CorrectionRequestRow,
} from "@/lib/clock/correction-request";
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
  is_early: boolean;
  early_minutes: number;
  payable_clocked_at: string | null;
  expected_at: string | null;
  is_early_abnormal: boolean;
  early_work_approved: boolean;
  early_reviewed_by: string | null;
  early_reviewed_at: string | null;
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
      expected_at,
      is_manually_corrected,
      corrected_by,
      corrected_at,
      original_clocked_at,
      note,
      is_early,
      early_minutes,
      payable_clocked_at,
      is_early_abnormal,
      early_work_approved,
      early_reviewed_by,
      early_reviewed_at,
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
      expected_at: r.expected_at ?? null,
      is_early: Boolean(r.is_early),
      early_minutes: Number(r.early_minutes ?? 0),
      payable_clocked_at: r.payable_clocked_at ?? null,
      is_early_abnormal: Boolean(r.is_early_abnormal),
      early_work_approved: Boolean(r.early_work_approved),
      early_reviewed_by: r.early_reviewed_by ?? null,
      early_reviewed_at: r.early_reviewed_at ?? null,
    };
  });

  const pendingEarlyReview = rows.filter(
    (r) => r.is_early_abnormal && r.clock_type === "clock_in"
  ).length;

  const pendingCorrections = await fetchPendingCorrectionRequests(clinic.id).catch(
    () => [] as CorrectionRequestRow[]
  );

  const { data: employees } = await supabase
    .from("employees")
    .select("id, name, employee_no")
    .eq("clinic_id", clinic.id)
    .eq("status", "active")
    .order("employee_no");

  return {
    clinic,
    date: targetDate,
    records: rows,
    pendingEarlyReview,
    pendingCorrections,
    employees: employees ?? [],
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
  revalidatePath("/payroll");
  return { success: true as const };
}

export async function reviewEarlyPunch(input: {
  recordId: string;
  approved: boolean;
  reviewedBy?: string;
}) {
  const result = await setEarlyWorkApproval({
    recordId: input.recordId,
    approved: input.approved,
    reviewedBy: input.reviewedBy?.trim() || "院長",
  });

  if (!result.success) {
    return { success: false as const, error: result.error };
  }

  revalidatePath("/clock-records");
  revalidatePath("/payroll");
  return { success: true as const };
}

export async function reviewForgotClockRequest(input: {
  requestId: string;
  approved: boolean;
  reviewedBy?: string;
  reviewNote?: string;
}) {
  const result = await reviewCorrectionRequest({
    requestId: input.requestId,
    approved: input.approved,
    reviewedBy: input.reviewedBy?.trim() || "院長",
    reviewNote: input.reviewNote,
  });

  if (!result.success) {
    return { success: false as const, error: result.error };
  }

  revalidatePath("/clock-records");
  revalidatePath("/payroll");
  return { success: true as const };
}

export type { CorrectionRequestRow };

export interface ClockExportRow {
  id: string;
  employee_id: string;
  employee_name: string;
  employee_no: string;
  clock_date: string;
  clock_type: string;
  clocked_at: string;
  shift_name: string | null;
  distance_from_clinic_m: number | null;
  source: string;
  validation: string;
  is_manually_corrected: boolean;
  note: string | null;
  latitude: number | null;
  longitude: number | null;
}

export async function fetchClockRecordsExportData(
  fromDate: string,
  toDate: string,
  employeeId?: string | null
) {
  const clinic = await getDefaultClinic();

  let query = supabase
    .from("clock_records")
    .select(
      `
      id,
      employee_id,
      clock_type,
      clocked_at,
      clock_date,
      latitude,
      longitude,
      distance_from_clinic_m,
      validation,
      source,
      is_manually_corrected,
      note,
      employees(name, employee_no),
      shift_assignments(shift_types(name))
    `
    )
    .gte("clock_date", fromDate)
    .lte("clock_date", toDate)
    .order("clock_date", { ascending: true })
    .order("clocked_at", { ascending: true });

  if (employeeId) {
    query = query.eq("employee_id", employeeId);
  }

  const { data: records, error } = await query;
  if (error) throw new Error(error.message);

  const rows: ClockExportRow[] = (records ?? []).map((r) => {
    const emp = parseJoin(r.employees) as { name?: string; employee_no?: string } | null;
    const assign = parseJoin(r.shift_assignments) as { shift_types?: unknown } | null;
    const shiftTypes = parseJoin(assign?.shift_types) as { name?: string } | null;

    return {
      id: r.id,
      employee_id: r.employee_id,
      employee_name: emp?.name ?? "—",
      employee_no: emp?.employee_no ?? "",
      clock_date: r.clock_date,
      clock_type: r.clock_type,
      clocked_at: r.clocked_at,
      shift_name: shiftTypes?.name ?? null,
      distance_from_clinic_m:
        r.distance_from_clinic_m != null ? Number(r.distance_from_clinic_m) : null,
      source: r.source,
      validation: r.validation,
      is_manually_corrected: Boolean(r.is_manually_corrected),
      note: r.note,
      latitude: r.latitude != null ? Number(r.latitude) : null,
      longitude: r.longitude != null ? Number(r.longitude) : null,
    };
  });

  const { data: employees } = await supabase
    .from("employees")
    .select("id, name, employee_no")
    .eq("clinic_id", clinic.id)
    .eq("status", "active")
    .order("employee_no");

  return {
    clinic,
    fromDate,
    toDate,
    rows,
    employees: employees ?? [],
  };
}

function parseJoin(raw: unknown): unknown {
  if (Array.isArray(raw)) return raw[0] ?? null;
  return raw ?? null;
}
