"use client";

import { useEffect, useState } from "react";

interface ScheduleTabProps {
  lineUserId: string;
}

interface DayRow {
  date: string;
  dayOfMonth: number;
  shifts: { code: string; name: string; timeRange: string }[];
  isClosure: boolean;
}

export function ScheduleTab({ lineUserId }: ScheduleTabProps) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [days, setDays] = useState<DayRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(
      `/api/mobile/schedule?lineUserId=${encodeURIComponent(lineUserId)}&year=${year}&month=${month}`
    )
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        setDays(data.days ?? []);
        setError(null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "載入失敗"));
  }, [lineUserId, year, month]);

  function changeMonth(delta: number) {
    let m = month + delta;
    let y = year;
    if (m > 12) {
      m = 1;
      y++;
    } else if (m < 1) {
      m = 12;
      y--;
    }
    setYear(y);
    setMonth(m);
  }

  const weekLabels = ["日", "一", "二", "三", "四", "五", "六"];

  return (
    <div className="px-4 pt-6">
      <header className="mb-4 text-center">
        <h1 className="text-xl font-bold">我的班表</h1>
        <p className="text-xs text-slate-500">四週變形工時 · 週期目標 160 小時</p>
        <div className="mt-3 flex items-center justify-center gap-3">
          <button onClick={() => changeMonth(-1)} className="rounded-lg border px-3 py-1 text-sm">
            ←
          </button>
          <span className="font-semibold">
            {year} 年 {month} 月
          </span>
          <button onClick={() => changeMonth(1)} className="rounded-lg border px-3 py-1 text-sm">
            →
          </button>
        </div>
      </header>

      {error && (
        <div className="mb-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <ul className="space-y-2">
        {days.map((d) => {
          const dow = new Date(`${d.date}T12:00:00+08:00`).getDay();
          const workShifts = d.shifts.filter(
            (s) => !["STATUTORY", "REST", "ANNUAL_LEAVE", "CLOSED"].includes(s.code)
          );
          const offShifts = d.shifts.filter((s) =>
            ["STATUTORY", "REST", "ANNUAL_LEAVE", "CLOSED"].includes(s.code)
          );

          return (
            <li
              key={d.date}
              className={`rounded-xl border bg-white px-3 py-2.5 shadow-sm ${
                d.isClosure ? "border-slate-300 bg-slate-50" : "border-slate-200"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">
                  {month}/{d.dayOfMonth}（{weekLabels[dow]}）
                </span>
                {d.isClosure && (
                  <span className="text-xs font-medium text-slate-500">診所休診</span>
                )}
              </div>
              {workShifts.length > 0 ? (
                <ul className="mt-1 space-y-0.5">
                  {workShifts.map((s, i) => (
                    <li key={i} className="text-xs text-blue-700">
                      {s.name} {s.timeRange}
                    </li>
                  ))}
                </ul>
              ) : offShifts.length > 0 ? (
                <p className="mt-1 text-xs text-slate-500">
                  {offShifts.map((s) => s.name).join("、")}
                </p>
              ) : (
                <p className="mt-1 text-xs text-slate-300">—</p>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
