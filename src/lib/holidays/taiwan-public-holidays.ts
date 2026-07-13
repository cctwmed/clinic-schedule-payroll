/** 中華民國國定假日（行政機關放假之日，含固定與補假） */
export interface PublicHoliday {
  date: string;
  name: string;
}

/** 2025–2027 國定假日（依行政院公布；春節等連假以放假日為準） */
const TAIWAN_PUBLIC_HOLIDAYS: PublicHoliday[] = [
  // 2025
  { date: "2025-01-01", name: "開國紀念日" },
  { date: "2025-01-28", name: "農曆除夕" },
  { date: "2025-01-29", name: "春節" },
  { date: "2025-01-30", name: "春節" },
  { date: "2025-01-31", name: "春節" },
  { date: "2025-02-28", name: "和平紀念日" },
  { date: "2025-04-04", name: "兒童節" },
  { date: "2025-04-05", name: "清明節" },
  { date: "2025-05-01", name: "勞動節" },
  { date: "2025-05-31", name: "端午節" },
  { date: "2025-10-06", name: "中秋節" },
  { date: "2025-10-10", name: "國慶日" },
  // 2026
  { date: "2026-01-01", name: "開國紀念日" },
  { date: "2026-02-16", name: "農曆除夕" },
  { date: "2026-02-17", name: "春節" },
  { date: "2026-02-18", name: "春節" },
  { date: "2026-02-19", name: "春節" },
  { date: "2026-02-20", name: "春節補假" },
  { date: "2026-02-28", name: "和平紀念日" },
  { date: "2026-04-03", name: "兒童節" },
  { date: "2026-04-04", name: "清明節" },
  { date: "2026-04-05", name: "清明補假" },
  { date: "2026-05-01", name: "勞動節" },
  { date: "2026-06-19", name: "端午節" },
  { date: "2026-09-25", name: "中秋節" },
  { date: "2026-10-09", name: "國慶日補假" },
  { date: "2026-10-10", name: "國慶日" },
  // 2027
  { date: "2027-01-01", name: "開國紀念日" },
  { date: "2027-02-05", name: "農曆除夕" },
  { date: "2027-02-06", name: "春節" },
  { date: "2027-02-07", name: "春節" },
  { date: "2027-02-08", name: "春節" },
  { date: "2027-02-28", name: "和平紀念日" },
  { date: "2027-04-04", name: "兒童節" },
  { date: "2027-04-05", name: "清明節" },
  { date: "2027-05-01", name: "勞動節" },
  { date: "2027-06-09", name: "端午節" },
  { date: "2027-09-15", name: "中秋節" },
  { date: "2027-10-10", name: "國慶日" },
];

const holidayMap = new Map(TAIWAN_PUBLIC_HOLIDAYS.map((h) => [h.date, h.name]));

export function isTaiwanPublicHoliday(date: string): boolean {
  return holidayMap.has(date);
}

export function getTaiwanPublicHolidayName(date: string): string | null {
  return holidayMap.get(date) ?? null;
}

export function listTaiwanPublicHolidaysInRange(
  periodStart: string,
  periodEnd: string
): PublicHoliday[] {
  return TAIWAN_PUBLIC_HOLIDAYS.filter(
    (h) => h.date >= periodStart && h.date <= periodEnd
  );
}

export function buildHolidayDateSet(dates: string[]): Set<string> {
  return new Set(dates.filter(isTaiwanPublicHoliday));
}
