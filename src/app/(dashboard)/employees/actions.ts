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
  return null;
}

function toPayload(form: EmployeeFormData, clinicId: string) {
  return {
    clinic_id: clinicId,
    employee_no: form.employee_no.trim(),
    name: form.name.trim(),
    role: form.role,
    job_title: form.job_title,
    employment_type: form.employment_type,
    status: form.status,
    email: form.email.trim() || null,
    phone: form.phone.trim() || null,
    hire_date: form.hire_date,
    hourly_wage: form.hourly_wage,
    labor_insurance_self_pay: form.labor_insurance_self_pay,
    health_insurance_self_pay: form.health_insurance_self_pay,
  };
}

export async function createEmployee(form: EmployeeFormData) {
  const validationError = validateForm(form);
  if (validationError) return { success: false as const, error: validationError };

  try {
    const clinicId = await getDefaultClinicId();
    const { error } = await supabase.from("employees").insert(toPayload(form, clinicId));

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
    const { error } = await supabase
      .from("employees")
      .update(toPayload(form, clinicId))
      .eq("id", id);

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
