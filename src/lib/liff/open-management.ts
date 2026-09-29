/**
 * 管理員後台：先用 LINE 管理員身分建立後台 session，再開啟頁面。
 * 一律走目前網址 origin，避免 NEXT_PUBLIC_APP_URL 不一致導致 cookie 無效、跳去登入頁。
 * 手機：同頁導向（內建瀏覽器常擋新分頁）。
 * 電腦：開新分頁並帶一次性 token。
 */
import { LIFF_ADMIN_QUERY } from "@/lib/auth/liff-dashboard-session";
import { readStoredLiffAdminToken, storeLiffAdminToken } from "@/lib/liff/admin-session";
import { parseApiJson } from "@/lib/liff/read-api-json";

export function resolveAppBase(appUrl?: string): string {
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin.replace(/\/$/, "");
  }
  const fromProp = (appUrl ?? "").replace(/\/$/, "");
  if (/^https?:\/\//i.test(fromProp)) return fromProp;
  return "https://clinic-schedule-payroll.vercel.app";
}

export function toAbsoluteAppUrl(href: string, appUrl?: string): string {
  if (/^https?:\/\//i.test(href)) {
    try {
      const parsed = new URL(href);
      if (typeof window !== "undefined" && window.location?.origin) {
        return `${window.location.origin}${parsed.pathname}${parsed.search}${parsed.hash}`;
      }
      return href;
    } catch {
      return href;
    }
  }
  const path = href.startsWith("/") ? href : `/${href}`;
  return `${resolveAppBase(appUrl)}${path}`;
}

function isPhoneViewport(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(max-width: 767px)").matches;
}

async function establishLiffAdminSession(
  lineUserId?: string
): Promise<string | null> {
  if (!lineUserId) return null;
  const res = await fetch("/api/auth/liff-dashboard", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({
      lineUserId,
      token: readStoredLiffAdminToken(),
    }),
  });
  const { ok, data } = await parseApiJson<{ error?: string; token?: string }>(res);
  if (!ok) {
    const stored = readStoredLiffAdminToken();
    if (stored) return stored;
    throw new Error(data.error ?? "無法開啟後台，請先用 forget50@hotmail.com 解鎖管理員");
  }
  if (data.token) storeLiffAdminToken(data.token);
  return data.token ?? null;
}

function withAdminToken(url: string, token: string | null): string {
  if (!token) return url;
  const next = new URL(url, typeof window !== "undefined" ? window.location.origin : url);
  next.searchParams.set(LIFF_ADMIN_QUERY, token);
  return next.toString();
}

export async function openManagementPage(
  href: string,
  appUrl?: string,
  options?: { lineUserId?: string }
): Promise<void> {
  if (typeof window === "undefined") return;

  let token: string | null = readStoredLiffAdminToken();
  if (options?.lineUserId) {
    try {
      token = (await establishLiffAdminSession(options.lineUserId)) ?? token;
    } catch (err) {
      if (!token) throw err;
    }
  }

  const targetUrl = withAdminToken(toAbsoluteAppUrl(href, appUrl), token);
  const liff = window.liff;

  if (isPhoneViewport()) {
    window.location.assign(targetUrl);
    return;
  }

  try {
    if (liff && typeof liff.openWindow === "function") {
      liff.openWindow({ url: targetUrl, external: true });
      return;
    }
  } catch {
    // LINE WebView often throws Failed to execute; stay in-page instead.
  }
  try {
    const opened = window.open(targetUrl, "_blank", "noopener,noreferrer");
    if (opened) return;
  } catch {
    // blocked
  }

  window.location.assign(targetUrl);
}
