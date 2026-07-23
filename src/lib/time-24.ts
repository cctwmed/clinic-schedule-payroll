/** 24 小時制 HH:mm 工具（前後端共用） */

export function normalizeHhMm(raw: string): string {
  const s = (raw || "00:00").trim();
  const m = /^(\d{1,2}):(\d{2})/.exec(s);
  if (!m) return "00:00";
  const hour = Math.min(23, Math.max(0, Number(m[1])));
  const minute = Math.min(59, Math.max(0, Number(m[2])));
  return `${pad2(hour)}:${pad2(minute)}`;
}

/** 計算兩段時間差（可跨日）；回傳分鐘 */
export function minutesBetweenHhMm(start: string, end: string): number {
  const a = normalizeHhMm(start);
  const b = normalizeHhMm(end);
  const [sh, sm] = a.split(":").map(Number);
  const [eh, em] = b.split(":").map(Number);
  const startM = sh * 60 + sm;
  let endM = eh * 60 + em;
  if (endM <= startM) endM += 24 * 60;
  return endM - startM;
}

export function formatDurationZh(totalMinutes: number): string {
  if (totalMinutes <= 0) return "0 分";
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h <= 0) return `${m} 分`;
  if (m <= 0) return `${h} 小時`;
  return `${h} 小時 ${m} 分`;
}

export function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function periodHintZh(hour: number): string {
  if (hour < 5) return "（凌晨）";
  if (hour < 12) return "（上午）";
  if (hour === 12) return "（中午）";
  if (hour < 18) return "（下午）";
  return "（晚上）";
}
