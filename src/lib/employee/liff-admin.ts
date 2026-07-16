import { resolveClinicAdmin, type AdminAccessContext } from "@/lib/employee/access";
import { supabase } from "@/lib/supabase";

export function parseEmployeeJoin(raw: unknown): {
  id?: string;
  name?: string;
  role?: string;
  employee_no?: string;
  is_clinic_admin?: boolean;
} | null {
  if (!raw) return null;
  const item = Array.isArray(raw) ? raw[0] : raw;
  if (!item || typeof item !== "object") return null;
  return item as {
    id?: string;
    name?: string;
    role?: string;
    employee_no?: string;
    is_clinic_admin?: boolean;
  };
}

/** 依 LINE 綁定與員工資料解析 LIFF 管理員權限 */
export async function resolveLiffAdminAccess(
  lineUserId: string,
  binding: { employee_id: string; employees: unknown } | null
): Promise<{ isClinicAdmin: boolean; employeeName: string | null; employeeNo: string | null }> {
  if (!binding?.employee_id) {
    return { isClinicAdmin: false, employeeName: null, employeeNo: null };
  }

  const emp = parseEmployeeJoin(binding.employees);
  let ctx: AdminAccessContext = {
    lineUserId,
    employeeNo: emp?.employee_no,
    name: emp?.name,
    role: emp?.role,
    is_clinic_admin: emp?.is_clinic_admin,
  };

  if (!resolveClinicAdmin(ctx)) {
    const { data: flags } = await supabase
      .from("employees")
      .select("employee_no, is_clinic_admin, name, role")
      .eq("id", binding.employee_id)
      .maybeSingle();

    if (flags) {
      ctx = {
        lineUserId,
        employeeNo: flags.employee_no,
        name: flags.name,
        role: flags.role,
        is_clinic_admin: flags.is_clinic_admin,
      };
    }
  }

  return {
    isClinicAdmin: resolveClinicAdmin(ctx),
    employeeName: ctx.name ?? null,
    employeeNo: ctx.employeeNo ?? null,
  };
}
