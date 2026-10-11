import { supabase } from "@/lib/supabase";
import {
  getSuperAdminLineUserIds,
  resolveClinicAdmin,
} from "@/lib/employee/access";
import { getLiffClockUrl, pushLineMessage } from "@/lib/line/client";

export type AdminReviewKind = "leave" | "overtime" | "correction";

const KIND_LABEL: Record<AdminReviewKind, string> = {
  leave: "請假",
  overtime: "加班",
  correction: "忘記／修正打卡",
};

const KIND_INBOX: Record<AdminReviewKind, "leave" | "overtime" | "abnormal"> = {
  leave: "leave",
  overtime: "overtime",
  correction: "abnormal",
};

export async function listClinicAdminLineUserIds(): Promise<string[]> {
  const ids = new Set(getSuperAdminLineUserIds());
  const { data: employees } = await supabase
    .from("employees")
    .select("id, name, email, employee_no, role, is_clinic_admin")
    .eq("status", "active");

  const adminEmployeeIds = (employees ?? [])
    .filter((row) =>
      resolveClinicAdmin({
        employeeNo: row.employee_no,
        name: row.name,
        email: row.email,
        role: row.role,
        is_clinic_admin: row.is_clinic_admin,
      })
    )
    .map((row) => String(row.id));

  if (adminEmployeeIds.length === 0 && ids.size === 0) return [];

  const { data: bindings } = await supabase
    .from("employee_line_bindings")
    .select("line_user_id, employee_id")
    .eq("is_active", true)
    .in("employee_id", adminEmployeeIds.length > 0 ? adminEmployeeIds : ["00000000-0000-0000-0000-000000000000"]);

  for (const row of bindings ?? []) {
    if (row.line_user_id) ids.add(String(row.line_user_id));
  }
  return [...ids];
}

export async function notifyClinicAdminsOfReview(input: {
  kind: AdminReviewKind;
  employeeName: string;
  summary: string;
  excludeLineUserId?: string;
}): Promise<void> {
  try {
    const adminIds = (await listClinicAdminLineUserIds()).filter(
      (id) => id && id !== input.excludeLineUserId
    );
    if (adminIds.length === 0) return;

    const reviewUrl = getLiffClockUrl(undefined, "admin-inbox", KIND_INBOX[input.kind]);
    const text = [
      `待審：${KIND_LABEL[input.kind]}`,
      `${input.employeeName} ${input.summary}`,
      "",
      "請到 LINE 管理員 → 審核頁核准或駁回。",
      reviewUrl,
    ].join("\n");

    await Promise.all(
      adminIds.map((lineUserId) =>
        pushLineMessage(lineUserId, [{ type: "text", text }]).catch(() => ({
          ok: false as const,
        }))
      )
    );
  } catch (err) {
    console.error("[notifyClinicAdminsOfReview]", err);
  }
}
