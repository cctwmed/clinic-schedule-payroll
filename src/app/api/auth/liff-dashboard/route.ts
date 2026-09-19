import { NextRequest, NextResponse } from "next/server";
import { resolveLiffAdminAccess, stampKnownClinicAdmins } from "@/lib/employee/liff-admin";
import { loadActiveLineBinding } from "@/lib/employee/load-liff-binding";
import {
  createLiffAdminToken,
  liffAdminCookieOptions,
  LIFF_ADMIN_COOKIE,
  verifyLiffAdminToken,
} from "@/lib/auth/liff-dashboard-session";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      lineUserId?: string;
      token?: string;
    };
    const lineUserId = body.lineUserId?.trim();
    if (!lineUserId) {
      return NextResponse.json({ error: "缺少 LINE 身分" }, { status: 400 });
    }

    await stampKnownClinicAdmins();
    const binding = await loadActiveLineBinding(lineUserId);
    const access = await resolveLiffAdminAccess(lineUserId, binding);
    const existing = await verifyLiffAdminToken(
      body.token ?? request.cookies.get(LIFF_ADMIN_COOKIE)?.value
    );
    const sessionOk = existing?.lineUserId === lineUserId;

    if (!access.isClinicAdmin && !sessionOk) {
      return NextResponse.json(
        { error: "您沒有管理員權限。請用 forget50@hotmail.com 在 LINE 管理員分頁解鎖。" },
        { status: 403 }
      );
    }

    const token = await createLiffAdminToken(lineUserId);
    const response = NextResponse.json({ ok: true, token });
    response.cookies.set(LIFF_ADMIN_COOKIE, token, liffAdminCookieOptions());
    return response;
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "無法開啟後台" },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(LIFF_ADMIN_COOKIE, "", {
    ...liffAdminCookieOptions(0),
    maxAge: 0,
  });
  return response;
}
