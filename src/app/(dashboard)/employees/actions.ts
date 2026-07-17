"use server";

import { revalidatePath } from "next/cache";
import { supabase } from "@/lib/supabase";
import { resolveAgeCompliance } from "@/lib/employee/age-compliance";
import type { EmployeeFormData } from "@/types/employee";

async function getDefaultClinicId(): Promise<string> {
  const { data, error } = await supabase
    .from("clinics")
    .select("id")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (data?.id) return data.id;

  const { data: created, error: createError } = await supabase
    .from("clinics")
    .insert({ name: "我的診所" })
    .select("id")
    .single();

  if (createError) throw new Error(createError.message);
  return created.id;
}

function validateForm(form: EmployeeFormData): string | null {
  if (!form.employee_no.trim()) return "請填寫員工編號";
  if (!form.name.trim()) return "請填寫姓名";
  if (!form.hire_date) return "請選擇到職日";
  if (form.hourly_wage < 0) return "時薪不可為負數";
  if (form.labor_insurance_self_pay < 0 || form.health_insurance_self_pay < 0) {
    return "勞健保自付額不可為負數";
  }
  if (
    form.labor_insurance_employer_pay < 0 ||
    form.health_insurance_employer_pay < 0 ||
    form.labor_pension_employer_pay < 0
  ) {
    return "雇主負擔規費不可為負數";
  }
  return null;
}

function isMissingColumn(message: string, column: string): boolean {
  return message.includes(column) && message.includes("schema cache");
}

function isMissingArrivalDateColumn(message: string): boolean {
  return isMissingColumn(message, "arrival_date");
}

function isMissingClinicAdminColumn(message: string): boolean {
  return isMissingColumn(message, "is_clinic_admin");
}

function isMissingJobTitleColumn(message: string): boolean {
  return isMissingColumn(message, "job_title");
}

function isMissingAgeInsuranceColumn(message: string): boolean {
  return (
    isMissingColumn(message, "birth_date") ||
    isMissingColumn(message, "national_id") ||
    isMissingColumn(message, "health_insurance_enrollment") ||
    isMissingColumn(message, "is_related_to_owner") ||
    isMissingColumn(message, "is_child_laborer")
  );
}

type PayloadFlags = {
  jobTitle: boolean;
  arrivalDate: boolean;
  clinicAdmin: boolean;
  ageInsurance: boolean;
};

const ALL_FLAGS: PayloadFlags = {
  jobTitle: true,
  arrivalDate: true,
  clinicAdmin: true,
  ageInsurance: true,
};

function toPayload(form: EmployeeFormData, clinicId: string, flags: PayloadFlags = ALL_FLAGS) {
  const compliance = resolveAgeCompliance(form.birth_date, form.national_id);

  const payload: Record<string, unknown> = {
    clinic_id: clinicId,
    employee_no: form.employee_no.trim(),
    name: form.name.trim(),
    role: form.role,
    employment_type: form.employment_type,
    status: form.status,
    email: form.email.trim() || null,
    phone: form.phone.trim() || null,
    hire_date: form.hire_date,
    hourly_wage: form.hourly_wage,
    labor_insurance_self_pay: form.labor_insurance_self_pay,
    health_insurance_self_pay: form.health_insurance_self_pay,
    labor_insurance_employer_pay: form.labor_insurance_employer_pay,
    health_insurance_employer_pay: form.health_insurance_employer_pay,
    labor_pension_employer_pay: form.labor_pension_employer_pay,
  };

  if (flags.arrivalDate) payload.arrival_date = form.hire_date;
  if (flags.jobTitle) payload.job_title = form.job_title;
  if (flags.clinicAdmin) {
    payload.is_clinic_admin = form.role === "admin" ? true : form.is_clinic_admin;
  }
  if (flags.ageInsurance) {
    payload.birth_date = compliance.birthDate;
    payload.national_id = form.national_id.trim() || null;
    payload.health_insurance_enrollment = form.health_insurance_enrollment;
    payload.is_related_to_owner = form.is_related_to_owner;
    payload.is_child_laborer = compliance.isChildLaborer;
  }

  return payload;
}

function stripFlag(message: string, flags: PayloadFlags, key: keyof PayloadFlags): PayloadFlags {
  if (isMissingJobTitleColumn(message) && key === "jobTitle") return { ...flags, jobTitle: false };
  if (isMissingArrivalDateColumn(message) && key === "arrivalDate") return { ...flags, arrivalDate: false };
  if (isMissingClinicAdminColumn(message) && key === "clinicAdmin") return { ...flags, clinicAdmin: false };
  if (isMissingAgeInsuranceColumn(message) && key === "ageInsurance") return { ...flags, ageInsurance: false };
  return flags;
}

async function persistEmployee(
  mode: "insert" | "update",
  form: EmployeeFormData,
  clinicId: string,
  id?: string
) {
  let flags = { ...ALL_FLAGS };
  let payload = toPayload(form, clinicId, flags);

  for (let attempt = 0; attempt < 8; attempt++) {
    const result =
      mode === "insert"
        ? await supabase.from("employees").insert(payload)
        : await supabase.from("employees").update(payload).eq("id", id!);

    if (!result.error) return { error: null as null };

    const msg = result.error.message;
    const prev = { ...flags };
    if (isMissingJobTitleColumn(msg)) flags = stripFlag(msg, flags, "jobTitle");
    if (isMissingArrivalDateColumn(msg)) flags = stripFlag(msg, flags, "arrivalDate");
    if (isMissingClinicAdminColumn(msg)) flags = stripFlag(msg, flags, "clinicAdmin");
    if (isMissingAgeInsuranceColumn(msg)) flags = stripFlag(msg, flags, "ageInsurance");

    if (JSON.stringify(prev) === JSON.stringify(flags)) {
      return { error: result.error };
    }
    payload = toPayload(form, clinicId, flags);
  }

  return { error: { message: "儲存失敗" } as { message: string } };
}

function buildSaveResult(form: EmployeeFormData) {
  const compliance = resolveAgeCompliance(form.birth_date, form.national_id);

  return {
    success: true as const,
    warning:
      compliance.status === "under_15"
        ? "⚠️ 提醒：同仁未滿 15 歲，依法非經主管機關許可不得僱用，且無法直接申報勞保。"
        : undefined,
    isChildLaborer: compliance.isChildLaborer,
    age: compliance.age,
  };
}

export async function createEmployee(form: EmployeeFormData) {
  const validationError = validateForm(form);
  if (validationError) return { success: false as const, error: validationError };

  try {
    const clinicId = await getDefaultClinicId();
    const { error } = await persistEmployee("insert", form, clinicId);

    if (error) {
      if ("code" in error && error.code === "23505") {
        return { success: false as const, error: "員工編號已存在，請改用其他編號" };
      }
      return { success: false as const, error: error.message };
    }

    revalidatePath("/employees");
    return buildSaveResult(form);
  } catch (err) {
    return {
      success: false as const,
      error: err instanceof Error ? err.message : "新增失敗，請稍後再試",
    };
  }
}

export async function updateEmployee(id: string, form: EmployeeFormData) {
  const validationError = validateForm(form);
  if (validationError) return { success: false as const, error: validationError };

  try {
    const clinicId = await getDefaultClinicId();
    const { error } = await persistEmployee("update", form, clinicId, id);

    if (error) {
      if ("code" in error && error.code === "23505") {
        return { success: false as const, error: "員工編號已存在，請改用其他編號" };
      }
      return { success: false as const, error: error.message };
    }

    revalidatePath("/employees");
    return buildSaveResult(form);
  } catch (err) {
    return {
      success: false as const,
      error: err instanceof Error ? err.message : "更新失敗，請稍後再試",
    };
  }
}

export async function fetchEmployees() {
  const { data, error } = await supabase
    .from("employees")
    .select("*")
    .order("employee_no", { ascending: true });

  if (error) throw new Error(error.message);

  const rank: Record<string, number> = { active: 0, inactive: 1, resigned: 2 };
  return (data ?? []).slice().sort((a, b) => {
    const ra = rank[a.status] ?? 9;
    const rb = rank[b.status] ?? 9;
    if (ra !== rb) return ra - rb;
    return String(a.employee_no).localeCompare(String(b.employee_no), "zh-Hant");
  });
}
