/** 固定具 LIFF 管理員權限的員工編號（不受 is_clinic_admin 欄位影響） */
export const SUPER_ADMIN_EMPLOYEE_NOS = ["H123146963"] as const;

export interface AdminAccessContext {
  lineUserId?: string | null;
  employeeNo?: string | null;
  name?: string | null;
  role?: string | null;
  is_clinic_admin?: boolean | null;
}

function normalizeEmployeeNo(no: string): string {
  return no.trim().toUpperCase();
}

/** 環境變數 CLINIC_SUPER_ADMIN_LINE_IDS=Uxxx,Uyyy 可追加 LINE 超級管理員 */
export function getSuperAdminLineUserIds(): string[] {
  const raw = process.env.CLINIC_SUPER_ADMIN_LINE_IDS ?? "";
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function isSuperAdminEmployeeNo(employeeNo: string | null | undefined): boolean {
  if (!employeeNo?.trim()) return false;
  const key = normalizeEmployeeNo(employeeNo);
  return SUPER_ADMIN_EMPLOYEE_NOS.some((n) => normalizeEmployeeNo(n) === key);
}

export function isSuperAdminLineUser(lineUserId: string | null | undefined): boolean {
  if (!lineUserId?.trim()) return false;
  return getSuperAdminLineUserIds().includes(lineUserId.trim());
}

/** 是否可進入 LIFF「管理員」模式 */
export function resolveClinicAdmin(ctx: AdminAccessContext | null | undefined): boolean {
  if (!ctx) return false;

  if (isSuperAdminLineUser(ctx.lineUserId)) return true;
  if (isSuperAdminEmployeeNo(ctx.employeeNo)) return true;

  if (ctx.role === "admin") return true;
  if (ctx.is_clinic_admin) return true;

  if (ctx.name?.trim() === "葉昱麟") return true;

  return false;
}
