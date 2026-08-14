/**
 * 管理員後台以「電腦瀏覽器」為主要操作環境。
 * 電腦：開新分頁／外部瀏覽器（完整側欄後台）。
 * 手機 LINE：同頁導向（內建瀏覽器常擋新分頁，否則會點了沒反應）。
 */
export function resolveAppBase(appUrl?: string): string {
  const fromProp = (appUrl ?? "").replace(/\/$/, "");
  if (/^https?:\/\//i.test(fromProp)) return fromProp;
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin;
  }
  return "https://clinic-schedule-payroll.vercel.app";
}

export function toAbsoluteAppUrl(href: string, appUrl?: string): string {
  if (/^https?:\/\//i.test(href)) return href;
  const path = href.startsWith("/") ? href : `/${href}`;
  return `${resolveAppBase(appUrl)}${path}`;
}

function isPhoneViewport(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(max-width: 767px)").matches;
}

export function openManagementPage(href: string, appUrl?: string): void {
  if (typeof window === "undefined") return;
  const url = toAbsoluteAppUrl(href, appUrl);
  const liff = window.liff;

  if (!isPhoneViewport()) {
    try {
      if (liff && typeof liff.openWindow === "function") {
        liff.openWindow({ url, external: true });
        return;
      }
    } catch {
      // fall through
    }
    const opened = window.open(url, "_blank", "noopener,noreferrer");
    if (opened) return;
  }

  window.location.assign(url);
}
