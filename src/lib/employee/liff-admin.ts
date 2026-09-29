import type { NextRequest } from "next/server";
import {
  LIFF_ADMIN_COOKIE,
  LIFF_ADMIN_QUERY,
  verifyLiffAdminToken,
} from "@/lib/auth/liff-dashboard-session";
import {
  isClinicAdminEmail,
  isClinicAdminName,
  resolveClinicAdmin,
  type AdminAccessContext,
} from "@/lib/employee/access";
import { loadActiveLineBinding } from "@/lib/employee/load-liff-binding";
import { supabase } from "@/lib/supabase";

export function parseEmployeeJoin(raw: unknown): {
  id?: string;
  name?: string;
  email?: string;
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
    email?: string;
    role?: string;
    employee_no?: string;
    is_clinic_admin?: boolean;
  };
}

async function loadEmployeeFlags(employeeId: string): Promise<{
  employee_no?: string | null;
  is_clinic_admin?: boolean | null;
  name?: string | null;
  email?: string | null;
  role?: string | null;
} | null> {
  const withAdmin = await supabase
    .from("employees")
    .select("employee_no, is_clinic_admin, name, email, role")
    .eq("id", employeeId)
    .maybeSingle();

  if (withAdmin.data) return withAdmin.data;

  const withoutAdmin = await supabase
    .from("employees")
    .select("employee_no, name, email, role")
    .eq("id", employeeId)
    .maybeSingle();

  return withoutAdmin.data ?? null;
}

/** 把葉昱麟／forget50@hotmail.com 員工標記為診所管理員 */
export async function stampKnownClinicAdmins(): Promise<void> {
  try {
    const { data, error } = await supabase
      .from("employees")
      .select("id, name, email, is_clinic_admin");
    if (error || !data) return;

    const ids = data
      .filter(
        (row) =>
          !row.is_clinic_admin &&
          (isClinicAdminName(row.name) || isClinicAdminEmail(row.email))
      )
      .map((row) => row.id);
    if (ids.length === 0) return;

    await supabase.from("employees").update({ is_clinic_admin: true }).in("id", ids);
  } catch {
    // 欄位尚未 migration 時略過，不擋管理員進入
  }
}

/** 依 LINE 綁定與員工資料解析 LIFF 管理員權限 */
export async function resolveLiffAdminAccess(
  lineUserId: string,
  binding: { employee_id: string; employees: unknown } | null
): Promise<{ isClinicAdmin: boolean; employeeName: string | null; employeeNo: string | null }> {
  if (!binding?.employee_id) {
    return {
      isClinicAdmin: resolveClinicAdmin({ lineUserId }),
      employeeName: null,
      employeeNo: null,
    };
  }

  const emp = parseEmployeeJoin(binding.employees);
  const flags = await loadEmployeeFlags(binding.employee_id);
  const ctx: AdminAccessContext = {
    lineUserId,
    employeeNo: flags?.employee_no ?? emp?.employee_no,
    name: flags?.name ?? emp?.name,
    email: flags?.email ?? emp?.email,
    role: flags?.role ?? emp?.role,
    is_clinic_admin: flags?.is_clinic_admin ?? emp?.is_clinic_admin,
  };

  return {
    isClinicAdmin: resolveClinicAdmin(ctx),
    employeeName: ctx.name ?? null,
    employeeNo: ctx.employeeNo ?? null,
  };
}

export function readLiffAdminTokenFromRequest(
  request: NextRequest,
  extraToken?: string | null
): string | null {
  const fromBody = extraToken?.trim();
  if (fromBody) return fromBody;
  const query = request.nextUrl.searchParams.get(LIFF_ADMIN_QUERY);
  if (query?.trim()) return query.trim();
  const header = request.headers.get("x-liff-admin");
  if (header?.trim()) return header.trim();
  const auth = request.headers.get("authorization");
  if (auth?.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
  return request.cookies.get(LIFF_ADMIN_COOKIE)?.value ?? null;
}

export async function assertMobileAdmin(input: {
  lineUserId: string;
  request: NextRequest;
  token?: string | null;
}): Promise<{ ok: true; reviewer: string } | { ok: false; error: string }> {
  const { lineUserId, request, token } = input;
  const binding = await loadActiveLineBinding(lineUserId);
  const access = await resolveLiffAdminAccess(lineUserId, binding);
  if (access.isClinicAdmin) {
    return { ok: true, reviewer: access.employeeName ?? "院長" };
  }

  const session = await verifyLiffAdminToken(readLiffAdminTokenFromRequest(request, token));
  if (session?.lineUserId === lineUserId) {
    return { ok: true, reviewer: access.employeeName ?? "院長" };
  }

  return {
    ok: false,
    error: "沒有管理員權限。請用 forget50@hotmail.com 在管理員分頁解鎖。",
  };
}
