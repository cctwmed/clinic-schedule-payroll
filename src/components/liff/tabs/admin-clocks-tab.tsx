"use client";

import { useEffect, useState } from "react";
import { adminRequestInit } from "@/lib/liff/admin-session";
import { friendlyLiffError, readApiJson } from "@/lib/liff/read-api-json";

interface AdminClocksTabProps {
  lineUserId: string;
}

const TYPE_LABELS: Record<string, string> = {
  clock_in: "上班",
  clock_out: "下班",
};

export function AdminClocksTab({ lineUserId }: AdminClocksTabProps) {
  const [date, setDate] = useState("");
  const [records, setRecords] = useState<
    {
      id: string;
      name: string;
      clockType: string;
      clockedAt: string;
      isLate: boolean;
      lateMinutes: number;
      isEarlyAbnormal: boolean;
      earlyMinutes: number;
    }[]
  >([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const req = adminRequestInit(lineUserId);
    fetch(`/api/mobile/admin/clocks?${req.query}`, {
      credentials: "include",
      headers: req.headers,
    })
      .then(async (res) => {
        const json = await readApiJson<{ date?: string; records?: typeof records }>(
          res,
          "載入失敗"
        );
        setDate(json.date ?? "");
        setRecords(json.records ?? []);
      })
      .catch((err) => setError(friendlyLiffError(err, "載入失敗")))
      .finally(() => setLoading(false));
  }, [lineUserId]);

  if (loading) return <p className="py-12 text-center text-sm text-black">載入出勤…</p>;
  if (error) {
    return <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>;
  }

  return (
    <div className="space-y-2 pb-8">
      <p className="text-sm font-bold text-black">{date} 打卡</p>
      {records.length === 0 && <p className="text-sm text-black">今日尚無打卡</p>}
      {records.map((row) => (
        <div key={row.id} className="rounded-2xl border border-slate-200 bg-white p-3">
          <p className="text-sm font-bold text-black">
            {row.name} · {TYPE_LABELS[row.clockType] ?? row.clockType}
          </p>
          <p className="text-xs text-black">
            {new Date(row.clockedAt).toLocaleTimeString("zh-TW", {
              timeZone: "Asia/Taipei",
              hour: "2-digit",
              minute: "2-digit",
            })}
            {row.isLate ? ` · 遲到 ${row.lateMinutes} 分` : ""}
            {row.isEarlyAbnormal ? ` · 提早待審 ${row.earlyMinutes} 分` : ""}
          </p>
        </div>
      ))}
    </div>
  );
}
