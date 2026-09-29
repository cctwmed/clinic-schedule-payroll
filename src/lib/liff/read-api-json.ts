/** LINE 內建瀏覽器常把 HTML／空回應丟給 res.json()，會變成 Failed to execute。 */

export function isBrowserJsonParseError(msg: string): boolean {
  return /Failed to execute|Unexpected token|is not valid JSON|Failed to fetch|Load failed|dynamically imported|ChunkLoadError|NetworkError/i.test(
    msg
  );
}

export function friendlyLiffError(err: unknown, fallback = "操作失敗，請稍後再試"): string {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  if (isBrowserJsonParseError(msg)) {
    return "此功能暫時無法開啟。請關閉視窗，從官方帳號重新點一次；若仍失敗請改用手機瀏覽器開啟。";
  }
  return msg.trim() || fallback;
}

export async function parseApiJson<T>(
  res: Response
): Promise<{ ok: boolean; status: number; data: T & { error?: string } }> {
  const raw = await res.text();
  let data: T & { error?: string };
  try {
    data = (raw ? JSON.parse(raw) : {}) as T & { error?: string };
  } catch {
    throw new Error(
      res.ok
        ? "伺服器回應格式錯誤，請關閉後重新開啟打卡頁"
        : `無法連線（${res.status}）。請關閉後重新開啟打卡頁。`
    );
  }
  return { ok: res.ok, status: res.status, data };
}

export async function readApiJson<T>(
  res: Response,
  fallbackError: string
): Promise<T> {
  const { ok, data } = await parseApiJson<T>(res);
  if (!ok) {
    throw new Error(data.error || fallbackError);
  }
  return data;
}
