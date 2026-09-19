const KEY = "liff_admin_token";

export function storeLiffAdminToken(token: string) {
  try {
    sessionStorage.setItem(KEY, token);
  } catch {
    // LINE webview may block storage
  }
}

export function readStoredLiffAdminToken(): string | null {
  try {
    return sessionStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function adminRequestInit(lineUserId: string): {
  query: string;
  headers: Record<string, string>;
} {
  const token = readStoredLiffAdminToken();
  const params = new URLSearchParams({ lineUserId });
  if (token) params.set("liff_admin", token);
  return {
    query: params.toString(),
    headers: token ? { "x-liff-admin": token } : {},
  };
}
