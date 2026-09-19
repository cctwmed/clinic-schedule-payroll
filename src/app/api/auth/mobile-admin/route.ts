import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import {
  createLiffAdminToken,
  LIFF_ADMIN_COOKIE,
  liffAdminCookieOptions,
} from "@/lib/auth/liff-dashboard-session";
import { isClinicAdminEmail } from "@/lib/employee/access";
import { stampKnownClinicAdmins } from "@/lib/employee/liff-admin";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      lineUserId?: string;
      email?: string;
      password?: string;
    };
    const lineUserId = body.lineUserId?.trim();
    const email = body.email?.trim() ?? "";
    const password = body.password ?? "";

    if (!lineUserId) {
      return NextResponse.json({ error: "缺少 LINE 身分" }, { status: 400 });
    }
    if (!email || !password) {
      return NextResponse.json({ error: "請輸入管理員 Email 與密碼" }, { status: 400 });
    }
    if (!isClinicAdminEmail(email)) {
      return NextResponse.json(
        { error: "此 Email 不是診所管理員帳號。請使用 forget50@hotmail.com" },
        { status: 403 }
      );
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !anon) {
      return NextResponse.json({ error: "系統未設定登入金鑰" }, { status: 500 });
    }

    const authClient = createClient(url, anon, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error } = await authClient.auth.signInWithPassword({
      email,
      password,
    });
    if (error) {
      return NextResponse.json(
        {
          error:
            error.message === "Invalid login credentials"
              ? "帳號或密碼錯誤"
              : error.message,
        },
        { status: 401 }
      );
    }

    await stampKnownClinicAdmins();

    const token = await createLiffAdminToken(lineUserId);
    const response = NextResponse.json({
      ok: true,
      token,
      isClinicAdmin: true,
      message: "已解鎖管理員",
    });
    response.cookies.set(LIFF_ADMIN_COOKIE, token, liffAdminCookieOptions());
    return response;
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "無法解鎖管理員" },
      { status: 500 }
    );
  }
}
