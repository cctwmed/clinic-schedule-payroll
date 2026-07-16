"use server";

import { revalidatePath } from "next/cache";
import { supabase } from "@/lib/supabase";
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

function isMissingArrivalDateColumn(message: string): boolean {
  return message.includes("arrival_date") && message.includes("schema cache");
}

function isMissingClinicAdminColumn(message: string): boolean {
  return message.includes("is_clinic_admin") && message.includes("schema cache");
}

function toPayload(
  form: EmployeeFormData,
  clinicId: string,
  includeJobTitle = true,
  includeArrivalDate = true,
  includeClinicAdmin = true
) {
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
  if (includeArrivalDate) {
    payload.arrival_date = form.hire_date;
  }
  if (includeJobTitle) {
    payload.job_title = form.job_title;
  }
  if (includeClinicAdmin) {
    payload.is_clinic_admin = form.is_clinic_admin;
  }
  return payload;
}

function isMissingJobTitleColumn(message: string): boolean {
  return message.includes("job_title") && message.includes("schema cache");
}

export async function createEmployee(form: EmployeeFormData) {
  const validationError = validateForm(form);
  if (validationError) return { success: false as const, error: validationError };

  try {
    const clinicId = await getDefaultClinicId();
    let { error } = await supabase.from("employees").insert(toPayload(form, clinicId));

    if (error && isMissingJobTitleColumn(error.message)) {
      ({ error } = await supabase.from("employees").insert(toPayload(form, clinicId, false)));
    }

    if (error && isMissingArrivalDateColumn(error.message)) {
      ({ error } = await supabase.from("employees").insert(toPayload(form, clinicId, true, false)));
    }

    if (error && isMissingJobTitleColumn(error.message) && isMissingArrivalDateColumn(error.message)) {
      ({ error } = await supabase.from("employees").insert(toPayload(form, clinicId, false, false)));
    }

    if (error && isMissingClinicAdminColumn(error.message)) {
      ({ error } = await supabase.from("employees").insert(toPayload(form, clinicId, true, true, false)));
    }

    if (error) {
      if (error.code === "23505") {
        return { success: false as const, error: "員工編號已存在，請改用其他編號" };
      }
      return { success: false as const, error: error.message };
    }

    revalidatePath("/employees");
    return { success: true as const };
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
    let { error } = await supabase
      .from("employees")
      .update(toPayload(form, clinicId))
      .eq("id", id);

    if (error && isMissingJobTitleColumn(error.message)) {
      ({ error } = await supabase
        .from("employees")
        .update(toPayload(form, clinicId, false))
        .eq("id", id));
    }

    if (error && isMissingArrivalDateColumn(error.message)) {
      ({ error } = await supabase
        .from("employees")
        .update(toPayload(form, clinicId, true, false))
        .eq("id", id));
    }

    if (error && isMissingJobTitleColumn(error.message) && isMissingArrivalDateColumn(error.message)) {
      ({ error } = await supabase
        .from("employees")
        .update(toPayload(form, clinicId, false, false))
        .eq("id", id));
    }

    if (error && isMissingClinicAdminColumn(error.message)) {
      ({ error } = await supabase
        .from("employees")
        .update(toPayload(form, clinicId, true, true, false))
        .eq("id", id));
    }

    if (error) {
      if (error.code === "23505") {
        return { success: false as const, error: "員工編號已存在，請改用其他編號" };
      }
      return { success: false as const, error: error.message };
    }

    revalidatePath("/employees");
    return { success: true as const };
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
    .neq("status", "resigned")
    .order("employee_no", { ascending: true });

  if (error) throw new Error(error.message);
  return data ?? [];
}
