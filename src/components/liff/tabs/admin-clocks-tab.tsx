"use client";

import { useCallback, useEffect, useState } from "react";
import { adminRequestInit } from "@/lib/liff/admin-session";
import { friendlyLiffError, readApiJson } from "@/lib/liff/read-api-json";

interface AdminClocksTabProps {
  lineUserId: string;
}

const TYPE_LABELS: Record<string, string> = {
  clock_in: "上班",
  clock_out: "下班",
  break_start: "休息開始",
  break_end: "休息結束",
};

interface ClockPerson {
  employeeId: string;
  name: string;
  employeeNo: string;
  records: {
    id: string;
    clockType: string;
    clockedAt: string;
    shiftName: string | null;
    isLate: boolean;
    lateMinutes: number;
    isEarlyAbnormal: boolean;
    earlyMinutes: number;
    isManuallyCorrected: boolean;
  }[];
}

interface ClocksPayload {
  date: string;
  prevDate: string;
  nextDate: string;
  today: string;
  summary: {
    staffCount: number;
    clockCount: number;
    lateCount: number;
    earlyCount: number;
    missingCount: number;
  };
  missing: {
    assignmentId: string;
    name: string;
    shiftName: string;
    expectedIn: string;
  }[];
  people: ClockPerson[];
}

function formatClockTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("zh-TW", {
    timeZone: "Asia/Taipei",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function AdminClocksTab({ lineUserId }: AdminClocksTabProps) {
  const [date, setDate] = useState("");
  const [data, setData] = useState<ClocksPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(
    async (targetDate?: string) => {
      setLoading(true);
      setError(null);
      try {
        const req = adminRequestInit(lineUserId);
        const params = new URLSearchParams(req.query);
        if (targetDate) params.set("date", targetDate);
        const res = await fetch(`/api/mobile/admin/clocks?${params.toString()}`, {
          credentials: "include",
          headers: req.headers,
        });
        const json = await readApiJson<ClocksPayload>(res, "載入出勤失敗");
        setData(json);
        setDate(json.date);
      } catch (err) {
        setError(friendlyLiffError(err, "載入出勤失敗"));
      } finally {
        setLoading(false);
      }
    },
    [lineUserId]
  );

  useEffect(() => {
    void load();
  }, [load]);

  if (loading && !data) {
    return <p className="py-12 text-center text-sm text-black">載入出勤…</p>;
  }
  if (error && !data) {
    return (
      <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
        {error}
      </p>
    );
  }
  if (!data) return null;

  const summary = data.summary;

  return (
    <div className="space-y-3 pb-8">
      <div className="flex items-center justify-center gap-2">
        <button
          type="button"
          onClick={() => void load(data.prevDate)}
          className="min-h-11 rounded-lg border border-slate-800 px-3 text-sm font-semibold text-black"
        >
          ← 前一天
        </button>
        <span className="min-w-28 text-center text-sm font-bold text-black">{date}</span>
        <button
          type="button"
          onClick={() => void load(data.nextDate)}
          className="min-h-11 rounded-lg border border-slate-800 px-3 text-sm font-semibold text-black"
        >
          後一天 →
        </button>
      </div>
      {date !== data.today && (
        <button
          type="button"
          onClick={() => void load(data.today)}
          className="mx-auto block text-xs font-semibold text-emerald-700"
        >
          回到今天
        </button>
      )}

      {error && (
        <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}

      <div className="grid grid-cols-4 gap-2">
        <SummaryChip label="已打卡" value={summary.staffCount} unit="人" />
        <SummaryChip label="遲到" value={summary.lateCount} unit="筆" warn={summary.lateCount > 0} />
        <SummaryChip
          label="提早待審"
          value={summary.earlyCount}
          unit="筆"
          warn={summary.earlyCount > 0}
        />
        <SummaryChip
          label="未打卡"
          value={summary.missingCount}
          unit="診"
          warn={summary.missingCount > 0}
        />
      </div>

      {data.missing.length > 0 && (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-3">
          <p className="text-sm font-bold text-amber-950">應出勤尚未打卡</p>
          <ul className="mt-2 space-y-1">
            {data.missing.map((row) => (
              <li key={row.assignmentId} className="text-xs text-amber-900">
                {row.name} · {row.shiftName}
                {row.expectedIn ? ` · 應到 ${row.expectedIn}` : ""}
              </li>
            ))}
          </ul>
        </section>
      )}

      {loading && (
        <p className="py-4 text-center text-xs text-slate-500">更新中…</p>
      )}

      {data.people.length === 0 && data.missing.length === 0 && !loading && (
        <p className="rounded-2xl border border-slate-200 bg-white p-4 text-center text-sm text-slate-600">
          這天尚無打卡紀錄
        </p>
      )}

      {data.people.map((person) => (
        <section
          key={person.employeeId}
          className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm"
        >
          <p className="text-sm font-bold text-black">
            {person.name}
            {person.employeeNo ? (
              <span className="ml-1 text-xs font-medium text-slate-500">
                {person.employeeNo}
              </span>
            ) : null}
          </p>
          <ul className="mt-2 space-y-1.5">
            {person.records.map((row) => (
              <li key={row.id} className="text-xs text-black">
                <span className="font-semibold">
                  {TYPE_LABELS[row.clockType] ?? row.clockType}
                </span>
                {row.shiftName ? ` · ${row.shiftName}` : ""}
                {` · ${formatClockTime(row.clockedAt)}`}
                {row.isLate ? ` · 遲到 ${row.lateMinutes} 分` : ""}
                {row.isEarlyAbnormal ? ` · 提早待審 ${row.earlyMinutes} 分` : ""}
                {row.isManuallyCorrected ? " · 主管修正" : ""}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function SummaryChip({
  label,
  value,
  unit,
  warn,
}: {
  label: string;
  value: number;
  unit: string;
  warn?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border px-2 py-2 text-center ${
        warn ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-white"
      }`}
    >
      <p className="text-[10px] font-medium text-slate-500">{label}</p>
      <p className="mt-0.5 text-base font-bold text-black">
        {value}
        <span className="ml-0.5 text-[10px] font-medium text-slate-500">{unit}</span>
      </p>
    </div>
  );
}
