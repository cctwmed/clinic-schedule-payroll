"use client";

import { useEffect, useState } from "react";
import { formatMoney } from "@/lib/payroll/calculator";

interface PayslipTabProps {
  lineUserId: string;
}

interface PayslipData {
  year: number;
  month: number;
  employeeName: string;
  components: {
    baseSalary: number;
    jobAllowance: number;
    fullAttendanceBonus: number;
    fixedTotal: number;
    overtimePay: number;
    laborInsurance: number;
    healthInsurance: number;
    netPay: number;
  };
  hours: { regular: number; overtime: number; overtimeTier2: number };
  overtimeDetail: { hourlyRate: number; tier1: string; tier2: string };
  note: string;
}

export function PayslipTab({ lineUserId }: PayslipTabProps) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [data, setData] = useState<PayslipData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(
      `/api/mobile/payslip?lineUserId=${encodeURIComponent(lineUserId)}&year=${year}&month=${month}`
    )
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error);
        setData(json);
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

  return (
    <div className="px-4 pt-6">
      <header className="mb-4 text-center">
        <h1 className="text-xl font-bold">薪水報表</h1>
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

      {data && (
        <div className="space-y-4">
          <section className="rounded-2xl bg-white p-4 shadow-sm">
            <p className="text-sm text-slate-500">{data.employeeName}</p>
            <p className="mt-2 text-2xl font-bold text-blue-700">{formatMoney(data.components.netPay)}</p>
            <p className="text-xs text-slate-400">預估實發（含扣款）</p>
          </section>

          <section className="rounded-2xl bg-white p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-800">固定薪資</h2>
            <Row label="底薪" value={data.components.baseSalary} />
            <Row label="職務加給" value={data.components.jobAllowance} />
            <Row label="全勤獎金" value={data.components.fullAttendanceBonus} />
            <Row label="小計" value={data.components.fixedTotal} bold />
          </section>

          <section className="rounded-2xl bg-white p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-800">加班費（時薪 142 元）</h2>
            <p className="text-xs text-slate-500">
              加班 {data.hours.overtime} 小時（第 3–4 段 {data.hours.overtimeTier2} 小時）
            </p>
            <Row label="加班費合計" value={data.components.overtimePay} bold />
            <p className="mt-2 text-[11px] text-slate-400">{data.overtimeDetail.tier1}</p>
            <p className="text-[11px] text-slate-400">{data.overtimeDetail.tier2}</p>
          </section>

          <section className="rounded-2xl bg-white p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-800">扣款</h2>
            <Row label="勞保自付" value={-data.components.laborInsurance} />
            <Row label="健保自付" value={-data.components.healthInsurance} />
          </section>

          <p className="text-center text-[11px] text-slate-400">{data.note}</p>
        </div>
      )}
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: number; bold?: boolean }) {
  return (
    <div className={`mt-2 flex justify-between text-sm ${bold ? "font-semibold" : ""}`}>
      <span className="text-slate-600">{label}</span>
      <span className={value < 0 ? "text-red-600" : "text-slate-900"}>
        {value < 0 ? "-" : ""}
        {formatMoney(Math.abs(value))}
      </span>
    </div>
  );
}
