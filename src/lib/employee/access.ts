/** 是否可進入 LIFF「管理員」模式 */
export function resolveClinicAdmin(emp: {
  role?: string | null;
  is_clinic_admin?: boolean | null;
  name?: string | null;
} | null): boolean {
  if (!emp) return false;
  if (emp.role === "admin") return true;
  if (emp.is_clinic_admin) return true;
  // 示範帳號（migration 未跑時仍可用）
  if (emp.name?.trim() === "葉昱麟") return true;
  return false;
}
