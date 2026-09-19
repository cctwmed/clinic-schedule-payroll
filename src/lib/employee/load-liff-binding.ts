import { supabase } from "@/lib/supabase";

export type LiffBindingRow = {
  employee_id: string;
  employees: unknown;
};

/**
 * 讀取 LINE 綁定。is_clinic_admin 欄位若尚未 migration，改降級查詢，避免管理員被誤判成未綁定。
 */
export async function loadActiveLineBinding(
  lineUserId: string
): Promise<LiffBindingRow | null> {
  const withAdminCol = await supabase
    .from("employee_line_bindings")
    .select("employee_id, employees(id, name, email, role, employee_no, is_clinic_admin)")
    .eq("line_user_id", lineUserId)
    .eq("is_active", true)
    .maybeSingle();

  if (withAdminCol.data?.employee_id) {
    return withAdminCol.data as LiffBindingRow;
  }

  const withoutAdminCol = await supabase
    .from("employee_line_bindings")
    .select("employee_id, employees(id, name, email, role, employee_no)")
    .eq("line_user_id", lineUserId)
    .eq("is_active", true)
    .maybeSingle();

  if (withoutAdminCol.data?.employee_id) {
    return withoutAdminCol.data as LiffBindingRow;
  }

  const bare = await supabase
    .from("employee_line_bindings")
    .select("employee_id")
    .eq("line_user_id", lineUserId)
    .eq("is_active", true)
    .maybeSingle();

  if (!bare.data?.employee_id) return null;
  return { employee_id: bare.data.employee_id, employees: null };
}
