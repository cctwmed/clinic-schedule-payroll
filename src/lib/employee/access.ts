/** 固定具 LIFF 管理員權限的員工編號（不受 is_clinic_admin 欄位影響） */
export const SUPER_ADMIN_EMPLOYEE_NOS = ["H123146963", "N-YYL"] as const;

/** 診所管理員姓名（空白／全形空白會忽略） */
export const CLINIC_ADMIN_NAMES = ["葉昱麟"] as const;

/** 後台登入 Email，手機管理員用同一組帳號解鎖 */
export const CLINIC_ADMIN_EMAILS = ["forget50@hotmail.com"] as const;

export interface AdminAccessContext {
  lineUserId?: string | null;
  employeeNo?: string | null;
  name?: string | null;
  email?: string | null;
  role?: string | null;
  is_clinic_admin?: boolean | null;
}

function normalizeEmployeeNo(no: string): string {
  return no.trim().toUpperCase();
}

export function normalizePersonName(name: string): string {
  return name.replace(/[\s\u3000]/g, "").trim();
}

export function normalizeAdminEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isClinicAdminName(name: string | null | undefined): boolean {
  if (!name?.trim()) return false;
  const key = normalizePersonName(name);
  return CLINIC_ADMIN_NAMES.some((admin) => {
    const adminKey = normalizePersonName(admin);
    return key === adminKey || key.includes(adminKey);
  });
}

export function getClinicAdminEmails(): string[] {
  const extra = (process.env.CLINIC_ADMIN_EMAILS ?? process.env.ADMIN_EMAIL ?? "")
    .split(",")
    .map((s) => normalizeAdminEmail(s))
    .filter(Boolean);
  return [...new Set([...CLINIC_ADMIN_EMAILS.map(normalizeAdminEmail), ...extra])];
}

export function isClinicAdminEmail(email: string | null | undefined): boolean {
  if (!email?.trim()) return false;
  const key = normalizeAdminEmail(email);
  return getClinicAdminEmails().includes(key);
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
  if (isClinicAdminName(ctx.name)) return true;
  if (isClinicAdminEmail(ctx.email)) return true;

  return false;
}
