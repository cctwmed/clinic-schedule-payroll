"use client";

import { useCallback, useEffect, useState } from "react";
import { adminRequestInit } from "@/lib/liff/admin-session";
import { formatMoney } from "@/lib/payroll/calculator";

interface AdminPayTabProps {
  lineUserId: string;
}

export function AdminPayTab({ lineUserId }: AdminPayTabProps) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [items, setItems] = useState<{ id: string; name: string; netPay: number; basePay: number }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const req = adminRequestInit(lineUserId);
      const res = await fetch(
        `/api/mobile/admin/payroll?${req.query}&year=${year}&month=${month}`,
        { credentials: "include", headers: req.headers }
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "載入薪資失敗");
      setItems(json.items ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "載入薪資失敗");
    } finally {
      setLoading(false);
    }
  }, [lineUserId, year, month]);

  useEffect(() => {
    void load();
  }, [load]);

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

  return (
    <div className="space-y-3 pb-8">
      <div className="flex items-center justify-center gap-3">
        <button
          type="button"
          onClick={() => changeMonth(-1)}
          className="min-h-11 rounded-lg border border-slate-800 px-3 font-semibold text-black"
        >
          ← 上個月
        </button>
        <span className="font-semibold text-black">
          {year} 年 {month} 月
        </span>
        <button
          type="button"
          onClick={() => changeMonth(1)}
          className="min-h-11 rounded-lg border border-slate-800 px-3 font-semibold text-black"
        >
          下個月 →
        </button>
      </div>
      {loading && <p className="py-8 text-center text-sm text-black">載入薪資…</p>}
      {error && (
        <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
      )}
      {items.map((item) => (
        <div key={item.id} className="rounded-2xl border border-slate-200 bg-white p-3">
          <p className="text-sm font-bold text-black">{item.name}</p>
          <p className="text-xs text-black">本薪 {formatMoney(item.basePay)}</p>
          <p className="text-base font-semibold text-black">實領 {formatMoney(item.netPay)}</p>
        </div>
      ))}
    </div>
  );
}
