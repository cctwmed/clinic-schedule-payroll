/** 勞保局查核用打卡紀錄匯出格式 */

export const CLOCK_TYPE_EXPORT_LABELS: Record<string, string> = {
  clock_in: "上班",
  clock_out: "下班",
  break_start: "休息開始",
  break_end: "休息結束",
};

export const CLOCK_SOURCE_LABELS: Record<string, string> = {
  liff: "LINE LIFF（GPS）",
  line: "LINE",
  manual: "人工補登",
  admin: "主管修正",
  correction: "補登核准",
};

export interface ClockExportRow {
  id: string;
  employee_id: string;
  employee_name: string;
  employee_no: string;
  clock_date: string;
  clock_type: string;
  clocked_at: string;
  shift_name: string | null;
  distance_from_clinic_m: number | null;
  source: string;
  validation: string;
  is_manually_corrected: boolean;
  note: string | null;
  latitude: number | null;
  longitude: number | null;
}

export function formatClockTimeTaipei(iso: string): string {
  return new Date(iso).toLocaleString("zh-TW", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

export function formatClockDateOnly(iso: string): string {
  return new Date(iso).toLocaleDateString("zh-TW", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

export function buildClockExportCsv(clinicName: string, rows: ClockExportRow[]): string {
  const header = [
    "診所名稱",
    "員工編號",
    "姓名",
    "工作日期",
    "打卡類型",
    "打卡時間",
    "班別",
    "GPS距離(公尺)",
    "打卡來源",
    "狀態",
    "備註",
  ];

  const lines = rows.map((r) => [
    clinicName,
    r.employee_no,
    r.employee_name,
    r.clock_date,
    CLOCK_TYPE_EXPORT_LABELS[r.clock_type] ?? r.clock_type,
    formatClockTimeTaipei(r.clocked_at),
    r.shift_name ?? "",
    r.distance_from_clinic_m != null ? String(Math.round(r.distance_from_clinic_m)) : "",
    CLOCK_SOURCE_LABELS[r.source] ?? r.source,
    r.is_manually_corrected ? "主管修正" : r.validation === "valid" ? "有效" : r.validation,
    (r.note ?? "").replace(/"/g, '""'),
  ]);

  const escape = (v: string) => `"${v}"`;
  return [header.map(escape).join(","), ...lines.map((row) => row.map((c) => escape(String(c))).join(","))].join(
    "\uFEFF\n"
  );
}

export function monthRangeFromDate(isoDate: string): { from: string; to: string } {
  const [y, m] = isoDate.split("-").map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  const mm = String(m).padStart(2, "0");
  return {
    from: `${y}-${mm}-01`,
    to: `${y}-${mm}-${String(lastDay).padStart(2, "0")}`,
  };
}
